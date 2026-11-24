/**
 * Clause-engine vectors — the SDK's clause engine (`src/clauses/`) at its
 * boundaries, named one by one.
 *
 * The generated cases (`clauseFuzz.test.ts`) are drawn at random; this file
 * names the boundaries: each character position of the datetime format, each
 * hex width, each shape the regex screen reads, each bound a spec declares.
 * Every value case is a field spec, a value, and the verdict the engine must
 * give; every spec case is a raw spec and whether the parser accepts it; every
 * encode case is content and the ABI bytes it must encode to. The expected
 * verdicts and bytes are stated in this file, beside the cases.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalize } from "../../src/agreement.js";
import {
    encodeContentFromSpec,
    parseClauseSpec,
    portablePatternMatches,
    portablePatternSize,
    validateContent,
    validateSignedContent,
} from "../../src/clauses/index.js";

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
    // Quantified groups whose body holds a quantifier, and their near
    // misses. The engine runs every one of them on every value, so a value
    // the pattern rejects is refused.
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
        group: `nested ${pattern}`,
        field: str({ pattern }),
        values: ["zzz", "a", "aa", "ab", "aab", "abc", "(a)", "+", "a+", ""],
    })),
    // Regex libraries part on these constructs and inputs; the portable core
    // (`isPortablePattern`) keeps a spec and a value clear of them, so a tool
    // in another language that applies the published format gives the same
    // verdicts.
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
        // Expanded size 4,034, run. The budget lets it run on 1,039
        // characters (4,194,304 / 4,034).
        group: "pattern near the size limit",
        field: str({ pattern: "^(?:\\w{1,31}){63}$" }),
        values: ["a".repeat(63), "a".repeat(62), "a".repeat(1039), "a".repeat(1040), "-".repeat(100), ""],
    },
    {
        // Expanded size 4,096, MAX_PATTERN_EXPANSION itself; it matches
        // every value, so only the budget refuses: 1,024 characters run,
        // 1,025 are refused, in UTF-16 units.
        group: "pattern at the size limit, values at the work budget",
        field: str({ pattern: "(?:a{0,31}){64}" }),
        values: ["a".repeat(1024), "a".repeat(1025), "", "🚚".repeat(512), "🚚".repeat(513)],
    },
    {
        // Expanded size 2,048: 2,048 characters run, 2,049 are refused.
        group: "pattern of size 2048, values at the work budget",
        field: str({ pattern: "(?:a{0,31}){32}" }),
        values: ["a".repeat(2048), "a".repeat(2049), "b".repeat(2048)],
    },
    {
        // The widest negated class, size 4,032: 1,040 characters run, 1,041
        // are refused. A space is in the class, `!` is not.
        group: "pattern, the widest class near the size limit, values at the work budget",
        field: str({ pattern: String.raw`^(?:[^!#%')+\-/13579;=?ACEGIKMOQSUWY\[\]_acegikmoqsuwy{}]{0,64}){31}$` }),
        values: [" ".repeat(1040), " ".repeat(1041), " ".repeat(1039) + "!", "b".repeat(64), "a"],
    },
    {
        // Expanded size 4,097: the spec does not parse.
        group: "pattern just over the size limit",
        field: str({ pattern: "(?:a{31}){64}a" }),
        values: ["a".repeat(1985), "b"],
    },
    {
        group: "pattern on values around 4,096 characters",
        field: str({ pattern: "^a$" }),
        values: ["b".repeat(4096), "b".repeat(4097), "🚚".repeat(2048), "🚚".repeat(2049)],
    },
    {
        // A field with no maxLength: a value of any length is tested.
        group: "pattern on values over 4,096 characters",
        field: str({ pattern: "^a+$" }),
        values: ["a".repeat(5000), "a".repeat(4999) + "b", "b".repeat(5000)],
    },
    {
        group: "pattern, a quantified group holding a quantifier",
        field: str({ pattern: "^([a-z0-9-]+\\.)+[a-z]{2,}$" }),
        values: ["example.com", "a.b-c.example.org", "example", "Example.com", "example.c", "-.io", ".io", ""],
    },
    {
        // Overlapping alternation, on a long value that does not match.
        group: "pattern, overlapping alternation",
        field: str({ pattern: ["^(a", "|a)*$"].join("") }),
        values: ["a".repeat(20_000) + "!", "a".repeat(20_000), ""],
    },
    {
        // Quantifiers nested twenty deep, under counts: the SDK folds them
        // into one, and the verdicts are those of the pattern as written.
        group: "pattern, quantifiers nested under counts",
        field: str({ pattern: `^(?:(?:${"(?:".repeat(20)}a${")+".repeat(20)}){4}){4}$` }),
        values: ["a".repeat(16), "a".repeat(300), "a".repeat(15), "b", ""],
    },
    {
        group: "pattern, optional items nested under counts",
        field: str({ pattern: `^(?:(?:${"(?:".repeat(20)}a${")?".repeat(20)}){4}){4}$` }),
        values: ["", "a".repeat(16), "a".repeat(17), "b"],
    },
    {
        // The same shapes under counts that take them past the size limit:
        // refused at parse.
        group: "pattern, quantifiers nested past the size limit",
        field: str({ pattern: `^(?:(?:${"(?:".repeat(20)}a${")*".repeat(20)}){64}){63}$` }),
        values: ["a", "b"],
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
    // The other standards the cap reads, each at its public cap and one grade
    // past it, and values that are no code of the standard: H3 resolution 8,
    // S2 level 13, Open Location Code length 6.
    {
        group: "h3, public",
        field: str({ format: "h3", disposition: "public" }),
        values: [
            "872830828ffffff", // resolution 7
            "8828308281fffff", // resolution 8, the cap
            "8828308281FFFFF", // resolution 8, upper case
            "8928308280fffff", // resolution 9, one past
            "8f28308280db6db", // resolution 15
            "9828308281fffff", // mode 3, no cell
            "8828308281ffffe", // a digit past the resolution is not 7
            "g828308281fffff",
            "",
        ],
    },
    {
        group: "s2, public",
        field: str({ format: "s2", disposition: "public" }),
        values: [
            "9", // level 0
            "89c259b", // level 12
            "89c259b4", // level 13, the cap
            "89c259b1", // level 14, one past
            "89c259b2", // the lowest set bit at an odd position
            "c", // face 6
            "4", // the lowest set bit above bit 60, no level
            "40", // the same id, a trailing zero kept
            "X",
            "",
        ],
    },
    {
        group: "olc, public",
        field: str({ format: "olc", disposition: "public" }),
        values: [
            "8FVC0000+", // length 4
            "8FVC9G00+", // length 6, the cap
            "8fvc9g00+", // length 6, lower case
            "8FVC9G8F+", // length 8, one grade past
            "9G8F+6X", // a short code, length 10
            "8FVC9G80+", // padding of odd length
            "8FVC9G8F+6", // one digit after the separator
            "FFVC9G00+", // a first digit past the latitude range
            "8FVC9G8F",
            "",
        ],
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
        group: "geohash in a nested object, public",
        field: { name: "v", type: "object", required: true, fields: [{ name: "g", type: "string", required: true, format: "geohash" }] },
        values: [{ g: "dr5reg" }, { g: "dr5regw" }],
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
    // The content's total, MAX_CONTENT_PATTERN_WORK (16,777,216), under a
    // pattern of size 4,032. Four values of 1,040 characters cost 16,773,120
    // and run; a fifth is refused. The many-small-values shape: 260 values
    // of 16 characters cost 16,773,120; 261 are refused.
    ...[4, 5].map((count) => ({
        label: `content total, ${count} values of 1040 characters`,
        fields: [{ name: "v", type: "array", required: true, items: { type: "string", pattern: "^(?:a{0,64}){31}$" } }],
        content: { v: Array.from({ length: count }, () => "a".repeat(1040)) },
    })),
    ...[260, 261].map((count) => ({
        label: `content total, ${count} values of 16 characters`,
        fields: [{ name: "v", type: "array", required: true, items: { type: "string", pattern: "^(?:a{0,64}){31}$" } }],
        content: { v: Array.from({ length: count }, () => "a".repeat(16)) },
    })),
    // Two fields add to one total, in the order the spec declares them.
    ...[[2, 2], [2, 3]].map(([first, second]) => ({
        label: `content total over two fields, ${first} and ${second} values`,
        fields: [
            { name: "a", type: "array", required: true, items: { type: "string", pattern: "^(?:a{0,64}){31}$" } },
            { name: "b", type: "array", required: true, items: { type: "string", pattern: "^(?:a{0,64}){31}$" } },
        ],
        content: {
            a: Array.from({ length: first }, () => "a".repeat(1040)),
            b: Array.from({ length: second }, () => "a".repeat(1040)),
        },
    })),
    // A value refused for its maxLength adds nothing to the total, so the
    // content's verdict is that refusal alone.
    {
        label: "content total, values over maxLength add nothing",
        fields: [{ name: "v", type: "array", required: true, items: { type: "string", maxLength: 1039, pattern: "^(?:a{0,64}){31}$" } }],
        content: { v: Array.from({ length: 20 }, () => "a".repeat(1040)) },
    },
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
    // The private caps of the other standards: H3 resolution 15, S2 level 30,
    // Open Location Code length 15. H3 and S2 write no finer grade, so the
    // case past each is a value that is no code; an Open Location Code of 16
    // digits is past the specification's longest.
    ...[
        { format: "h3", values: ["8f28308280db6db", "8e28308280db6df", "8f28308280db6db0"] },
        { format: "s2", values: ["89c259b1e3d47a4b", "89c259b1e3d47a4c", "89c259b1e3d47a4b0"] },
        { format: "olc", values: ["8FVC9G8F+6X23456", "9G8F+6X", "8FVC9G8F+6X234567"] },
    ].flatMap(({ format, values }) =>
        values.map((g) => ({
            label: `private ${format} ${JSON.stringify(g)}`,
            fields: [{ name: "g", type: "string", required: true, format, disposition: "private" }, BLINDING],
            content: { g, b: B32 },
        })),
    ),
    // The reference geolocation clause's shape: an enum sibling of the capped standards.
    ...[
        { std: "h3", loc: "8828308281fffff" },
        { std: "h3", loc: "8928308280fffff" },
        { std: "s2", loc: "89c259b4" },
        { std: "s2", loc: "89c259b1" },
        { std: "s2", loc: "dr5reg" },
        { std: "olc", loc: "8FVC9G00+" },
        { std: "olc", loc: "8FVC9G8F+" },
        { loc: "dr5reg" },
        { loc: "dr5regw" },
    ].map((content) => ({
        label: `formatFromField, an enum sibling of the capped standards ${JSON.stringify(content)}`,
        fields: [
            { name: "std", type: "enum", values: ["geohash", "h3", "s2", "olc"], required: false, default: "geohash" },
            { name: "loc", type: "string", required: true, disposition: "public", formatFromField: "std" },
        ],
        content,
    })),
    // A nested field keeps its own disposition for the grain; a private one makes its set private (the set rules).
    ...[{ v: { g: "dr5regw" }, b: B32 }, { v: { g: "dr5regw3pg6s" }, b: B32 }, { v: { g: "dr5regw3pg6st" }, b: B32 }].map((content) => ({
        label: `geohash in a nested object, private, in a private set ${JSON.stringify(content)}`,
        fields: [
            { name: "v", type: "object", required: true, disposition: "private", fields: [{ name: "g", type: "string", required: true, format: "geohash", disposition: "private" }] },
            BLINDING,
        ],
        content,
    })),
    // The array field's disposition governs its items, never the item's own.
    ...[{ v: ["dr5regw3pg6s"], b: B32 }, { v: ["dr5regw3pg6st"], b: B32 }].map((content) => ({
        label: `geohash items marked private in a private array ${JSON.stringify(content)}`,
        fields: [{ name: "v", type: "array", required: true, disposition: "private", items: { type: "string", format: "geohash", disposition: "private" } }, BLINDING],
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
    // Two fields share the sibling's name: the first of them gives the default.
    ...[
        ["the first with no default", [{ name: "std", type: "string", required: false }, { name: "std", type: "string", required: false, default: "geohash" }]],
        ["the first whose default is geohash", [{ name: "std", type: "string", required: false, default: "geohash" }, { name: "std", type: "string", required: false }]],
    ].map(([which, siblings]) => ({
        label: `formatFromField, two siblings of one name, ${which}`,
        fields: [...(siblings as object[]), { name: "loc", type: "string", required: true, formatFromField: "std" }],
        content: { loc: "dr5regw" },
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

/** Shapes that cost an automaton the most per unit of expanded size —
 *  quantifiers nested on quantifiers, capturing groups nested in groups,
 *  alternation, counted ranges — each under the largest outer count that
 *  keeps it at or under MAX_PATTERN_EXPANSION, and under one count more. */
function nearLimitPatterns(): string[] {
    const nested = (k: number, q: string, open: string) => open.repeat(k) + "a" + `)${q}`.repeat(k);
    const bodies: string[] = [];
    for (const q of ["*", "+", "?", "{0,}", "{1,}", "{0,1}"]) {
        for (const k of [1, 5, 20, 40]) {
            bodies.push(nested(k, q, "(?:"), nested(k, q, "("));
        }
    }
    bodies.push("a|b", "a|a", "a|", "a|b|c|d|e|f|g|h", "(?:a|a)*", "a?|b?", "a*|b*", "a{0,64}", "a{1,64}", "(?:a{0,8}){8}", "(?:\\ba)*", "\\w*\\W?");
    const out: string[] = [];
    for (const body of bodies) {
        for (const wrap of [(m: number) => `^(?:(?:${body}){64}){${m}}$`, (m: number) => `^(?:${body}){${m}}$`]) {
            let fit = 0;
            for (let m = 1; m <= 64; m++) if (portablePatternSize(wrap(m)) !== null) fit = m;
            if (fit > 0) out.push(wrap(fit));
            if (fit < 64) out.push(wrap(fit + 1));
        }
    }
    return [...new Set(out)];
}

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
    { label: "enum sentinel not a value", spec: specOf(f({ type: "enum", values: ["a"], sentinel: "none" })) },
    { label: "enum valueLabels", spec: specOf(f({ type: "enum", values: ["a", "b"], valueLabels: { a: "A" } })) },
    { label: "enum valueLabels key not a value", spec: specOf(f({ type: "enum", values: ["a"], valueLabels: { z: "Z" } })) },
    { label: "enum valueLabels entry a number", spec: specOf(f({ type: "enum", values: ["a"], valueLabels: { a: 1 } })) },
    { label: "enum valueLabels an array", spec: specOf(f({ type: "enum", values: ["a"], valueLabels: ["A"] })) },
    { label: "field label", spec: specOf(f({ type: "boolean", label: "V" })) },
    { label: "field label a number", spec: specOf(f({ type: "boolean", label: 1 })) },
    { label: "field description a number", spec: specOf(f({ type: "boolean", description: 1 })) },
    { label: "clauseId empty", spec: { ...specOf(f({ type: "boolean" })), clauseId: "" } },
    { label: "title empty", spec: { ...specOf(f({ type: "boolean" })), title: "" } },
    { label: "description a number", spec: { ...specOf(f({ type: "boolean" })), description: 1 } },
    { label: "array without items", spec: specOf(f({ type: "array" })) },
    { label: "array items a string", spec: specOf(f({ type: "array", items: "integer" })) },
    { label: "array items an array", spec: specOf(f({ type: "array", items: [] })) },
    { label: "array items ok", spec: specOf(f({ type: "array", items: { type: "integer" } })) },
    { label: "array minItems -1", spec: specOf(f({ type: "array", items: { type: "integer" }, minItems: -1 })) },
    { label: "array maxItems -1", spec: specOf(f({ type: "array", items: { type: "integer" }, maxItems: -1 })) },
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
    // The expanded size (MAX_PATTERN_EXPANSION, 4096). Counts multiply when
    // they nest, so a short pattern can stand for millions of items: the
    // bound refuses such a pattern at parse, before any value is read.
    ...[
        "(?:a{31}){64}",
        "(?:a{31}){64}a",
        "(?:a{0,31}){64}",
        "(?:\\w{31}){64}",
        "(?:\\W{31}){64}",
        "(?:.{31}){64}",
        "(?:[^a]{31}){64}",
        "(?:\\b\\w{30}){64}",
        // The widest classes: every other printable character, plain and
        // negated, 48 and 49 byte ranges, at the size limit and one past it.
        "(?:[!#%')+/13579;=?ACEGIKMOQSUWY_acegikmoqsuwy{}]{0,63}){32}",
        "(?:[!#%')+/13579;=?ACEGIKMOQSUWY_acegikmoqsuwy{}]{0,63}){32}a",
        String.raw`(?:[^!#%')+\-/13579;=?ACEGIKMOQSUWY\[\]_acegikmoqsuwy{}]{0,63}){32}`,
        String.raw`(?:[^!#%')+\-/13579;=?ACEGIKMOQSUWY\[\]_acegikmoqsuwy{}]{0,63}){32}a`,
        String.raw`^(?:[^!#%')+\-/13579;=?ACEGIKMOQSUWY\[\]_acegikmoqsuwy{}]{0,64}){31}$`,
        "(?:(?:(?:(?:a{64}){64}){64}){64})",
        "(?:a{64}){64}",
        "(?:a{64}){64}a",
        "^(?:a{64}){63}a{62}$",
        "^(?:a{64}){63}a{63}$",
        "(?:(?:ab|cd){64}){16}",
        "(?:(?:ab|cd){64}){16}e",
        "(?:a{64,}){63}",
        "(?:a{64,}){64}",
        "(?:a{1,64}){64}",
        "(?:a{1,64}){64}?",
        "(?:a{64}){64}b{0}",
        "(?:a{64}){64}(?:bc){0}",
        "(?:(?:(?:(?:a{64}){64}){64}){64}){0}",
        "(?:(?:(?:(?:a{64}){64}){64}){64}){0}b",
        "(?:a+){64}(?:b*){64}",
        "(?:\\w{64}){64}",
        "(?:\\W{64}){64}",
        "(?:\\D{64}){64}",
        "(?:\\S{64}){64}",
        "(?:.{64}){64}",
        "(?:[^a]{64}){64}",
        "(?:\\b\\w{63}){64}",
        "\\w{64}\\w{64}\\w{64}\\w{64}\\w{64}",
    ].map((pattern) => ({ label: `pattern expansion ${pattern}`, spec: specOf(f({ type: "string", pattern })) })),
    // Shapes fitted to the size limit, each under the largest count that
    // keeps it at or under MAX_PATTERN_EXPANSION and under one count more.
    // Each verdict is pinned in SPEC_VERDICTS below.
    ...nearLimitPatterns().map((pattern) => ({ label: `pattern near the size limit ${pattern}`, spec: specOf(f({ type: "string", pattern })) })),
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
    // A private field nested in a public one makes its top-level field private for the set rules.
    { label: "a private field nested in a public object", spec: specOf([{ name: "o", type: "object", required: true, fields: [{ name: "v", type: "boolean", required: true, disposition: "private" }] }]) },
    { label: "a private field nested in a public object, with a blinding field", spec: specOf([{ name: "o", type: "object", required: true, fields: [{ name: "v", type: "boolean", required: true, disposition: "private" }] }, BLINDING]) },
    { label: "a private field two objects deep in a public object, with a blinding field", spec: specOf([{ name: "o", type: "object", required: true, fields: [{ name: "p", type: "object", required: true, fields: [{ name: "v", type: "boolean", required: true, disposition: "private" }] }] }, BLINDING]) },
    { label: "a private item in a public array", spec: specOf([{ name: "a", type: "array", required: true, items: { type: "boolean", disposition: "private" } }]) },
    { label: "a private item in a public array, with a blinding field", spec: specOf([{ name: "a", type: "array", required: true, items: { type: "boolean", disposition: "private" } }, BLINDING]) },
    { label: "a private field nested in a private object, with a blinding field", spec: specOf([{ name: "o", type: "object", required: true, disposition: "private", fields: [{ name: "v", type: "boolean", required: true, disposition: "private" }] }, BLINDING]) },
    { label: "a private field nested in a public stage object", spec: specOf(f({ type: "boolean" }), { "1": [{ name: "o", type: "object", required: true, fields: [{ name: "v", type: "boolean", required: true, disposition: "private" }] }, BLINDING] }) },
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
    { label: "a private field nested in a public object named v", spec: specOf(f({ type: "object", fields: [{ name: "w", type: "boolean", required: true, disposition: "private" }] })) },
    // Each stage's set keeps the same rules.
    { label: "a private stage with its blinding field", spec: specOf(f({ type: "boolean" }), { 1: [{ name: "r", type: "integer", required: true, disposition: "private" }, BLINDING] }) },
    { label: "a private stage without a blinding field", spec: specOf(f({ type: "boolean" }), { 1: [{ name: "r", type: "integer", required: true, disposition: "private" }] }) },
    { label: "a mixed stage", spec: specOf(f({ type: "boolean" }), { 1: [{ name: "r", type: "integer", required: true, disposition: "private" }, { name: "n", type: "string", required: true }, BLINDING] }) },
    { label: "a public stage with a blinding field", spec: specOf(f({ type: "boolean" }), { 2: [{ name: "n", type: "string", required: true }, BLINDING] }) },
    { label: "an empty stage", spec: specOf(f({ type: "boolean" }), { 1: [] }) },
    // The empty anchor: present only as true, never beside a top-level default.
    { label: "emptyAnchor true", spec: { ...specOf(f({ type: "enum", values: ["a", "b"] })), emptyAnchor: true } },
    { label: "emptyAnchor false", spec: { ...specOf(f({ type: "enum", values: ["a", "b"] })), emptyAnchor: false } },
    { label: "emptyAnchor as a string", spec: { ...specOf(f({ type: "enum", values: ["a", "b"] })), emptyAnchor: "true" } },
    { label: "emptyAnchor beside a top-level default", spec: { ...specOf(f({ type: "enum", values: ["a", "b"], default: "a" })), emptyAnchor: true } },
    { label: "emptyAnchor beside a stage field's default", spec: { ...specOf(f({ type: "boolean" }), { 1: f({ type: "enum", values: ["a", "b"], default: "a" }) }), emptyAnchor: true } },
];

/** The content the parties SIGN, under the sign gate's one rule
 *  (`validateSignedContent`): `{}` and nothing else
 *  for a spec that declares `emptyAnchor`, content valid over `fields` for
 *  every other, `{}` included. The spec is a stranger's: its `block` names an
 *  article no code knows, and the rule reads none of it. */
const LADDER: Field[] = [{ name: "call", type: "enum", values: ["arrived", "berthed", "sailed"], required: true }];
const STRANGER_BLOCK = { design: { article: "harbor-log" } };
const SIGNED_CASES: { label: string; spec: Record<string, unknown>; content: unknown; ok: boolean }[] = [
    { label: "the empty anchor, declared", spec: { ...specOf(LADDER), emptyAnchor: true, block: STRANGER_BLOCK }, content: {}, ok: true },
    { label: "content, under a declared empty anchor", spec: { ...specOf(LADDER), emptyAnchor: true, block: STRANGER_BLOCK }, content: { call: "arrived" }, ok: false },
    { label: "an array, under a declared empty anchor", spec: { ...specOf(LADDER), emptyAnchor: true, block: STRANGER_BLOCK }, content: [], ok: false },
    { label: "null, under a declared empty anchor", spec: { ...specOf(LADDER), emptyAnchor: true, block: STRANGER_BLOCK }, content: null, ok: false },
    { label: "the empty anchor, declared, beside a stage set", spec: { ...specOf(LADDER, { 1: f({ type: "string" }) }), emptyAnchor: true, block: STRANGER_BLOCK }, content: {}, ok: true },
    { label: "the empty anchor, not declared, required field", spec: { ...specOf(LADDER), block: STRANGER_BLOCK }, content: {}, ok: false },
    { label: "the empty anchor, not declared, the attestations article", spec: { ...specOf(LADDER), block: { design: { article: "attestations" } } }, content: {}, ok: false },
    { label: "content, not declared", spec: { ...specOf(LADDER), block: STRANGER_BLOCK }, content: { call: "arrived" }, ok: true },
    { label: "the empty anchor, not declared, no required field", spec: specOf([{ name: "note", type: "string", required: false }]), content: {}, ok: true },
];

/** Encoded bytes for the values whose bytes a verdict alone does not show. */
const ENCODE_CASES: { label: string; fields: Field[]; stages?: Record<number, Field[]>; stage?: number; content: Record<string, unknown>; encoded: string }[] = [
    // A blinding value encodes as bytes32 in a private set.
    {
        label: "a private set with its blinding value",
        fields: [{ name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" }, BLINDING],
        content: { grade: "b", b: B32 },
        encoded: "0x0000000000000000000000000000000000000000000000000000000000000001abababababababababababababababababababababababababababababababab",
    },
    {
        label: "a private stage with its blinding value",
        fields: [{ name: "note", type: "string", required: true }],
        stages: { 1: [{ name: "reading", type: "integer", required: true, disposition: "private" }, BLINDING] },
        stage: 1,
        content: { reading: 42, b: `0x${"cd".repeat(32)}` },
        encoded: "0x000000000000000000000000000000000000000000000000000000000000002acdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
    },
    // A spec that declares `stages["0"]` encodes stage-0 content over that set.
    {
        label: "a stage-0 set",
        fields: [{ name: "note", type: "string", required: true }],
        stages: { 0: [{ name: "reading", type: "integer", required: true }] },
        stage: 0,
        content: { reading: 7 },
        encoded: "0x0000000000000000000000000000000000000000000000000000000000000007",
    },
    { label: "a public geohash at the cap", fields: [str({ format: "geohash" })], content: { v: "dr5reg" }, encoded: "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000066472357265670000000000000000000000000000000000000000000000000000" },
    { label: "bytes-hex empty", fields: [str({ format: "bytes-hex" })], content: { v: "0x" }, encoded: "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000000" },
    { label: "bytes-hex one byte", fields: [str({ format: "bytes-hex" })], content: { v: "0x00" }, encoded: "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000" },
    { label: "bytes-hex 01", fields: [str({ format: "bytes-hex" })], content: { v: "0x01" }, encoded: "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010100000000000000000000000000000000000000000000000000000000000000" },
    { label: "bytes-hex long", fields: [str({ format: "bytes-hex" })], content: { v: `0x${"ab".repeat(40)}` }, encoded: "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000028abababababababababababababababababababababababababababababababababababababababab000000000000000000000000000000000000000000000000" },
    { label: "bytes-hex upper", fields: [str({ format: "bytes-hex" })], content: { v: "0xABCD" }, encoded: "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002ABCD000000000000000000000000000000000000000000000000000000000000" },
    { label: "bigint leading zeros", fields: [{ name: "v", type: "bigint", required: true }], content: { v: "007" }, encoded: "0x0000000000000000000000000000000000000000000000000000000000000007" },
    { label: "integer negative", fields: [{ name: "v", type: "integer", required: true }], content: { v: -273 }, encoded: "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeef" },
    { label: "integer safe max", fields: [{ name: "v", type: "integer", required: true }], content: { v: 9007199254740991 }, encoded: "0x000000000000000000000000000000000000000000000000001fffffffffffff" },
    { label: "string outside ASCII", fields: [str()], content: { v: "é🚚" }, encoded: "0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000006c3a9f09f9a9a0000000000000000000000000000000000000000000000000000" },
];

// ── The verdicts ────────────────────────────────────────────────────────────

/** A value case's verdict: `true` accepted, `false` refused, `null` when the
 *  field's own spec does not parse. */
function verdict(fields: unknown, content: unknown): boolean | null {
    const parsed = parseClauseSpec(specOf(fields));
    if (!parsed.ok) return null;
    return validateContent(content, parsed.spec).ok;
}

/** Each value group's verdicts, one letter per value in the order the group
 *  lists them: T accepted, F refused, - the field's own spec does not parse. */
const VALUE_VERDICTS: Readonly<Record<string, string>> = {
    "iso-datetime": "TTTTTTTFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "bytes32-hex": "TTFFFFFF",
    "address-hex": "TTFFFFFFFF",
    "bytes-hex": "TTTTFFFFFFFT",
    "open format": "TTT",
    "string length, UTF-16 units": "FFTTFFTTTFT",
    "pattern": "TFFFT",
    "nested (a+)+$": "FTTFFFFFFF",
    "nested (a*)*$": "TTTTTTTTTT",
    "nested (a+)*$": "TTTTTTTTTT",
    "nested (a{2,})+$": "FFTFFFFFFF",
    "nested ((a+))+$": "FTTFFFFFFF",
    "nested ((a)+)+$": "FTTFFFFFFF",
    "nested (a|b+)+$": "FTTTTFFFFF",
    "nested ^(a+)$": "FTTFFFFFFF",
    "nested ^(ab)+$": "FFFTFFFFFF",
    "nested ^a+b+$": "FFFTTFFFFF",
    "nested ^(a)(b+)$": "FFFTFFFFFF",
    "nested ^(a+)(b)+$": "FFFTTFFFFF",
    "nested ^\\(a+\\)+$": "FFFFFFTFFF",
    "nested ^[+*]+$": "FFFFFFFTFF",
    "nested ^[(+)]+$": "FFFFFFFTFF",
    "nested ^[\\]+]+$": "FFFFFFFTFF",
    "nested ^(a[+*])+$": "FFFFFFFFTF",
    "nested ^(a\\+)+$": "FFFFFFFFTF",
    "nested ^(a)+$": "FTTFFFFFFF",
    "nested ^(a){2}$": "FFTFFFFFFF",
    "nested ^(a+){2}$": "FFTFFFFFFF",
    "nested ^(a+)?$": "FTTFFFFFFT",
    "nested ^((a)(b+))+$": "FFFTFFFFFF",
    "nested ^(a(b+)c)*$": "FFFFFTFFFT",
    "nested ^(a(b)c)*$": "FFFFFTFFFT",
    "nested ^(?:a+)+$": "FTTFFFFFFF",
    "nested ^a{2}$": "FFTFFFFFFF",
    "nested ^([+])+$": "FFFFFFFTFF",
    "nested ^([a][+])+$": "FFFFFFFFTF",
    "nested ^([a][b][*])+$": "FFFFFFFFFF",
    "nested ^([\\]+])+$": "FFFFFFFTFF",
    "nested ^([\\]][+])+$": "FFFFFFFFFF",
    "nested ^([\\\\][+])+$": "FFFFFFFFFF",
    "nested ^([+\\]])+$": "FFFFFFFTFF",
    "nested ^([{])+$": "FFFFFFFFFF",
    "nested ^(a[+]b+)+$": "FFFFFFFFFF",
    "nested ^([+]b)+$": "FFFFFFFFFF",
    "dialect ^(?!foo).*$": "-------------------------",
    "dialect ^(?=a).*$": "-------------------------",
    "dialect ^(?<=a)b$": "-------------------------",
    "dialect ^(a)\\1$": "-------------------------",
    "dialect ^(?<n>a)\\k<n>$": "-------------------------",
    "dialect ^(?<n>a)$": "-------------------------",
    "dialect (?i)^a$": "-------------------------",
    "dialect ^\\d$": "FFFFFFFFFFFFFFTFFFFFFFFFF",
    "dialect ^\\w+$": "TTTTTTFFFTTFFFTFFFFFFFFFF",
    "dialect ^\\s$": "FFFFFFFFFFFFFFFFFFFTFFFFF",
    "dialect ^.$": "FTFFTTTTTTTFFFTFFFFTFFFFF",
    "dialect ^..$": "FFTTFFFFFFFFFFFFFFFFFFFFF",
    "dialect ^a$": "FTFFFFFFFFFFFFFFFFFFFFFFF",
    "dialect ^[a&&b]$": "-------------------------",
    "dialect ^[a--b]$": "-------------------------",
    "dialect ^[[:alpha:]]$": "-------------------------",
    "dialect ^\\p{L}$": "-------------------------",
    "dialect ^a*+$": "-------------------------",
    "dialect ^a++$": "-------------------------",
    "dialect ^\\x41$": "-------------------------",
    "dialect ^\\u0041$": "-------------------------",
    "dialect ^\\u{41}$": "-------------------------",
    "dialect ^\\cA$": "-------------------------",
    "dialect ^[^a]$": "FFFFTTTTTTTFFFTFFFFTFFFFF",
    "dialect ^\\bfoo\\b$": "TFFFFFFFFFFFFFFFFFFFFFFFF",
    "dialect ^a{,2}$": "-------------------------",
    "dialect ^a{2,1}$": "-------------------------",
    "dialect ^\\/$": "FFFFFFFFTFFFFFFFFFFFFFFFF",
    "dialect ^\\-$": "FFFFFFFTFFFFFFFFFFFFFFFFF",
    "dialect ^[\\w-]+$": "TTTTTTFTFTTFFFTFFFFFFFFFF",
    "dialect ^\\e$": "-------------------------",
    "dialect ^\\a$": "-------------------------",
    "dialect ^\\z$": "-------------------------",
    "dialect ^a\\Z$": "-------------------------",
    "dialect ^\\Aa$": "-------------------------",
    "core ^[A-Za-z][A-Za-z0-9-]{1,15}$": "FTTTTFFFFFFFFFFFFFFFFTTFFFFFF",
    "core ^[A-Za-z0-9][A-Za-z0-9 ./-]{0,63}$": "TTTTTTTFFFFFFFFFFFTTTTTTFFFFF",
    "core ^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$": "FTTTTFFFFFFFFFFFFFFFFFTFFFFFF",
    "core ^UN[0-9]{4}$": "FFFFFFFFFFFFFFFFFFFFFTFFFFFFF",
    "core ^[-a]$": "TFFFFFFTFFFFFFFFFFFFFFFFFFFFF",
    "core ^[a-]$": "TFFFFFFTFFFFFFFFFFFFFFFFFFFFF",
    "core ^[a-c-]$": "TFFFFTTTFFFFFFFFFFFFFFFFFFFFF",
    "core ^[z-a]$": "-----------------------------",
    "core ^[a-c-e]$": "-----------------------------",
    "core ^[a\\-c]$": "TFFFFFTTFFFFFFFFFFFFFFFFFFFFF",
    "core ^[\\d-z]$": "-----------------------------",
    "core ^[a-\\d]$": "-----------------------------",
    "core ^[]a]$": "-----------------------------",
    "core ^[^]a]$": "-----------------------------",
    "core ^[^]$": "-----------------------------",
    "core ^[a[b]]$": "-----------------------------",
    "core ^[a~~b]$": "-----------------------------",
    "core ^a{2}$": "FTFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^a{2,}$": "FTTFFFFFFFFFFFFFFFFFFFFTTFFFF",
    "core ^a{2,3}$": "FTTFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^a{3,2}$": "-----------------------------",
    "core ^a{64}$": "FFFFFFFFFFFFFFFFFFFFFFFTFFFFF",
    "core ^a{65}$": "-----------------------------",
    "core ^a{0,64}$": "TTTFFFFFFFFFFFFFFFFFFFFTFFFFT",
    "core ^a{1000}$": "-----------------------------",
    "core ^a{}$": "-----------------------------",
    "core ^a{,}$": "-----------------------------",
    "core ^a{2,3$": "-----------------------------",
    "core ^a}$": "-----------------------------",
    "core ^a]$": "-----------------------------",
    "core ^a*?$": "TTTFFFFFFFFFFFFFFFFFFFFTTFFFT",
    "core ^a+?$": "TTTFFFFFFFFFFFFFFFFFFFFTTFFFF",
    "core ^a??$": "TFFFFFFFFFFFFFFFFFFFFFFFFFFFT",
    "core ^a{2}?$": "FTFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^a**$": "-----------------------------",
    "core ^a?*$": "-----------------------------",
    "core ^*a$": "-----------------------------",
    "core ^(*a)$": "-----------------------------",
    "core ^a|*b$": "-----------------------------",
    "core ^$*": "-----------------------------",
    "core ^\\b*a$": "-----------------------------",
    "core ^(?:a|b)c$": "FFFFTFFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^(a|)c$": "FFFFTFTFFFFFFFFFFFFFFFFFFFFFF",
    "core ^a|$": "TTTTTTTTTTTTTTTTTTTTTTTTTFFFT",
    "core ^()$": "FFFFFFFFFFFFFFFFFFFFFFFFFFFFT",
    "core ^(a$": "-----------------------------",
    "core ^a)$": "-----------------------------",
    "core ^\\.$": "FFFFFFFFFFFFFTFFFFFFFFFFFFFFF",
    "core ^\\\\$": "FFFFFFFFFFFFFFTFFFFFFFFFFFFFF",
    "core ^\\<$": "-----------------------------",
    "core ^\\_$": "-----------------------------",
    "core ^\\ $": "-----------------------------",
    "core ^\\n$": "-----------------------------",
    "core ^\\t$": "-----------------------------",
    "core ^\\1$": "-----------------------------",
    "core ^\\": "-----------------------------",
    "core abc(?:\\n)": "-----------------------------",
    "core abc(?:d)": "FFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^[a&b]$": "TFFFFTFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^[a~b]$": "TFFFFTFFFFTFFFFFFFFFFFFFFFFFF",
    "core ^[&]$": "FFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^[a&]$": "TFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^[~a]$": "TFFFFFFFFFTFFFFFFFFFFFFFFFFFF",
    "core ^[a&&]$": "-----------------------------",
    "core ^[&&a]$": "-----------------------------",
    "core ^[A-\\d]$": "-----------------------------",
    "core ^[A-\\]]$": "-----------------------------",
    "core ^[A-[a]$": "-----------------------------",
    "core ^[!-\\.]$": "-----------------------------",
    "core ^[a-a]$": "TFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^[a-b]$": "TFFFFTFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^[\\n]$": "-----------------------------",
    "core ^[\\x]$": "-----------------------------",
    "core ^[a\\b]$": "-----------------------------",
    "core ^[\\d\\w\\s]$": "TFFFFTTFFFFFFFFFTTTTTFFFFFFFF",
    "core ^[\\.\\-\\]]$": "FFFFFFFTTFFFFTFFFFFFFFFFFFFFF",
    "core ^[^-a]$": "FFFFFTTFTTTTTTTTTTTTTFFFFFFFF",
    "core ^[^a-]$": "FFFFFTTFTTTTTTTTTTTTTFFFFFFFF",
    "core ^[^^]$": "TFFFFTTTTFTTTTTTTTTTTFFFFFFFF",
    "core ^a{2": "-----------------------------",
    "core a{12": "-----------------------------",
    "core a{1,2": "-----------------------------",
    "core a{1,": "-----------------------------",
    "core ^a{064}$": "FFFFFFFFFFFFFFFFFFFFFFFTFFFFF",
    "core ^a{001}$": "TFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "core ^a{0001}$": "-----------------------------",
    "core ^a{0064}$": "-----------------------------",
    "core ^a{1,064}$": "TTTFFFFFFFFFFFFFFFFFFFFTFFFFF",
    "core ^a{1,0064}$": "-----------------------------",
    "core ^a{065}$": "-----------------------------",
    "core ^a{0,0}$": "FFFFFFFFFFFFFFFFFFFFFFFFFFFFT",
    "core ^a{0}$": "FFFFFFFFFFFFFFFFFFFFFFFFFFFFT",
    "core aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": "FFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
    "core aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": "-----------------------------",
    "core ^é$": "-----------------------------",
    "core ": "-----------------------------",
    "pattern near the size limit": "TFTFFF",
    "pattern at the size limit, values at the work budget": "TFTFF",
    "pattern of size 2048, values at the work budget": "TFT",
    "pattern, the widest class near the size limit, values at the work budget": "TFFTF",
    "pattern just over the size limit": "--",
    "pattern on values around 4,096 characters": "FFFF",
    "pattern on values over 4,096 characters": "TFF",
    "pattern, a quantified group holding a quantifier": "TTFFFTFF",
    "pattern, overlapping alternation": "FTT",
    "pattern, quantifiers nested under counts": "TTFFF",
    "pattern, optional items nested under counts": "TTFF",
    "pattern, quantifiers nested past the size limit": "--",
    "integer": "FTTTFFTFFFFFFF",
    "integer, unbounded": "TTFFFT",
    "bigint": "FTTTFTTFTFFFFFFFFF",
    "bigint, zero and its written forms": "TTTTTTFFFT",
    "bigint, a signed zero bound": "TTFF",
    "bigint, a negative lower bound": "TTTTFF",
    "bigint, unbounded": "TTTFTT",
    "enum": "TTFFFFF",
    "boolean": "TTFFFF",
    "array": "FTTFFFFFF",
    "object": "TTFFFFFFFF",
    "optional": "TFF",
    "geohash, no disposition": "TTTTFFFTFTFF",
    "geohash, public": "TTTTFFFTFTFF",
    "h3, public": "TTTFFFFFF",
    "s2, public": "TTTFFFFFFF",
    "olc, public": "TTTFFFFFFF",
    "a format the cap does not read": "TT",
    "geohash items of a public array": "TTFFF",
    "geohash in a nested object, public": "TF",
    "formatFromField with no sibling, a static geohash format": "TF",
    "formatFromField with no sibling, no static format": "T",
};

/** Each whole-content case's verdict. */
const CONTENT_VERDICTS: Readonly<Record<string, boolean>> = {
    "absent optional": true,
    "absent required": false,
    "unknown field": false,
    "unknown field beside a known one": false,
    "content total, 4 values of 1040 characters": true,
    "content total, 5 values of 1040 characters": false,
    "content total, 260 values of 16 characters": true,
    "content total, 261 values of 16 characters": false,
    "content total over two fields, 2 and 2 values": true,
    "content total over two fields, 2 and 3 values": false,
    "content total, values over maxLength add nothing": false,
    "content is an array": false,
    "content is null": false,
    "content is a string": false,
    "private geohash {\"g\":\"dr5regw3pg6s\",\"b\":\"0xabababababababababababababababababababababababababababababababab\"}": true,
    "private geohash {\"g\":\"dr5regw3pg6st\",\"b\":\"0xabababababababababababababababababababababababababababababababab\"}": false,
    "private geohash {\"g\":\"dr5reg\"}": false,
    "private geohash {\"g\":\"dr5reg\",\"b\":\"0xab\"}": false,
    "private h3 \"8f28308280db6db\"": true,
    "private h3 \"8e28308280db6df\"": true,
    "private h3 \"8f28308280db6db0\"": false,
    "private s2 \"89c259b1e3d47a4b\"": true,
    "private s2 \"89c259b1e3d47a4c\"": true,
    "private s2 \"89c259b1e3d47a4b0\"": false,
    "private olc \"8FVC9G8F+6X23456\"": true,
    "private olc \"9G8F+6X\"": true,
    "private olc \"8FVC9G8F+6X234567\"": false,
    "formatFromField, an enum sibling of the capped standards {\"std\":\"h3\",\"loc\":\"8828308281fffff\"}": true,
    "formatFromField, an enum sibling of the capped standards {\"std\":\"h3\",\"loc\":\"8928308280fffff\"}": false,
    "formatFromField, an enum sibling of the capped standards {\"std\":\"s2\",\"loc\":\"89c259b4\"}": true,
    "formatFromField, an enum sibling of the capped standards {\"std\":\"s2\",\"loc\":\"89c259b1\"}": false,
    "formatFromField, an enum sibling of the capped standards {\"std\":\"s2\",\"loc\":\"dr5reg\"}": false,
    "formatFromField, an enum sibling of the capped standards {\"std\":\"olc\",\"loc\":\"8FVC9G00+\"}": true,
    "formatFromField, an enum sibling of the capped standards {\"std\":\"olc\",\"loc\":\"8FVC9G8F+\"}": false,
    "formatFromField, an enum sibling of the capped standards {\"loc\":\"dr5reg\"}": true,
    "formatFromField, an enum sibling of the capped standards {\"loc\":\"dr5regw\"}": false,
    "geohash in a nested object, private, in a private set {\"v\":{\"g\":\"dr5regw\"},\"b\":\"0xabababababababababababababababababababababababababababababababab\"}": true,
    "geohash in a nested object, private, in a private set {\"v\":{\"g\":\"dr5regw3pg6s\"},\"b\":\"0xabababababababababababababababababababababababababababababababab\"}": true,
    "geohash in a nested object, private, in a private set {\"v\":{\"g\":\"dr5regw3pg6st\"},\"b\":\"0xabababababababababababababababababababababababababababababababab\"}": false,
    "geohash items marked private in a private array {\"v\":[\"dr5regw3pg6s\"],\"b\":\"0xabababababababababababababababababababababababababababababababab\"}": true,
    "geohash items marked private in a private array {\"v\":[\"dr5regw3pg6st\"],\"b\":\"0xabababababababababababababababababababababababababababababababab\"}": false,
    "private array of geohashes {\"a\":[\"dr5regw3pg6s\"],\"b\":\"0xabababababababababababababababababababababababababababababababab\"}": true,
    "private array of geohashes {\"a\":[\"dr5regw3pg6st\"],\"b\":\"0xabababababababababababababababababababababababababababababababab\"}": false,
    "formatFromField, a sibling with no default {\"std\":\"geohash\",\"loc\":\"dr5regw\"}": false,
    "formatFromField, a sibling with no default {\"std\":\"geohash\",\"loc\":\"dr5reg\"}": true,
    "formatFromField, a sibling with no default {\"std\":\"plus-code\",\"loc\":\"dr5regw3pg6st\"}": true,
    "formatFromField, a sibling with no default {\"std\":\"\",\"loc\":\"dr5regw\"}": true,
    "formatFromField, a sibling with no default {\"loc\":\"dr5regw\"}": true,
    "formatFromField, a sibling whose default is geohash {\"loc\":\"dr5regw\"}": false,
    "formatFromField, a sibling whose default is geohash {\"std\":\"\",\"loc\":\"dr5regw\"}": false,
    "formatFromField, a sibling whose default is geohash {\"std\":\"plus-code\",\"loc\":\"dr5regw\"}": true,
    "formatFromField, a sibling whose default is geohash {\"std\":\"geohash\",\"loc\":\"dr5reg\"}": true,
    "formatFromField, an enum sibling whose default is geohash {\"loc\":\"dr5regw\"}": false,
    "formatFromField, an enum sibling whose default is geohash {\"std\":\"geohash\",\"loc\":\"dr5regw\"}": false,
    "formatFromField over a static geohash format {\"loc\":\"dr5regw\"}": false,
    "formatFromField over a static geohash format {\"std\":\"plus-code\",\"loc\":\"dr5regw\"}": true,
    "formatFromField, a sibling whose value is no string": false,
    "formatFromField naming the field itself {\"loc\":\"geohash\"}": false,
    "formatFromField naming the field itself {\"loc\":\"dr5regw\"}": true,
    "formatFromField, two siblings of one name, the first with no default": true,
    "formatFromField, two siblings of one name, the first whose default is geohash": false,
    "an absent optional field named toString": true,
    "an absent optional field named constructor": true,
    "an absent optional field named valueOf": true,
    "an absent optional field named hasOwnProperty": true,
    "an absent optional field named __proto__": true,
    "an absent optional object field named constructor": true,
    "an absent required field named toString": false,
    "a present field named __proto__": true,
    "an undeclared key named toString": false,
};

/** Whether the parser accepts each spec case. */
const SPEC_VERDICTS: Readonly<Record<string, boolean>> = {
    "minimal": true,
    "empty field name": false,
    "missing required flag": false,
    "unknown type": false,
    "version 0": true,
    "version -1": false,
    "version 1.5": false,
    "version 1.0": true,
    "version 1e21": false,
    "version as string": false,
    "version past the safe range": false,
    "version at the safe range": true,
    "integer max past the safe range": false,
    "maxLength past the safe range": false,
    "minLength 0": true,
    "minLength -1": false,
    "minLength 1.5": false,
    "maxLength -1": false,
    "integer min 1.5": false,
    "integer min -3": true,
    "bigint min empty": false,
    "bigint min signed": true,
    "bigint min lone sign": false,
    "bigint min hex": false,
    "bigint min number": false,
    "bigint max plus": false,
    "enum empty values": false,
    "enum no values": false,
    "enum one value": true,
    "enum sentinel": true,
    "enum sentinel not a value": false,
    "enum valueLabels": true,
    "enum valueLabels key not a value": false,
    "enum valueLabels entry a number": false,
    "enum valueLabels an array": false,
    "field label": true,
    "field label a number": false,
    "field description a number": false,
    "clauseId empty": false,
    "title empty": false,
    "description a number": false,
    "array without items": false,
    "array items a string": false,
    "array items an array": false,
    "array items ok": true,
    "array minItems -1": false,
    "array maxItems -1": false,
    "object without fields": false,
    "object empty fields": true,
    "default string": true,
    "default string wrong type": false,
    "default integer": true,
    "default integer at min": true,
    "default integer above max": false,
    "default integer below min": false,
    "default integer 1.5": false,
    "default integer 2.0": true,
    "default bigint": true,
    "default bigint number": false,
    "default bigint malformed": false,
    "default boolean": true,
    "default boolean wrong type": false,
    "default enum member": true,
    "default enum stranger": false,
    "default enum sentinel": false,
    "default array of enum": true,
    "default array of enum stranger": false,
    "default array not an array": false,
    "default on an object": false,
    "nesting depth 6": true,
    "nesting depth 7": true,
    "nesting depth 8": true,
    "nesting depth 9": true,
    "nesting depth 10": true,
    "nesting depth 11": true,
    "nesting depth 12": true,
    "nesting depth 16": true,
    "nesting depth 17": false,
    "nesting depth 32": false,
    "nesting depth 33": false,
    "pattern unbalanced close": false,
    "pattern unbalanced open": false,
    "pattern open class": false,
    "pattern not a string": false,
    "pattern expansion (?:a{31}){64}": true,
    "pattern expansion (?:a{31}){64}a": false,
    "pattern expansion (?:a{0,31}){64}": true,
    "pattern expansion (?:\\w{31}){64}": true,
    "pattern expansion (?:\\W{31}){64}": true,
    "pattern expansion (?:.{31}){64}": true,
    "pattern expansion (?:[^a]{31}){64}": true,
    "pattern expansion (?:\\b\\w{30}){64}": true,
    "pattern expansion (?:[!#%')+/13579;=?ACEGIKMOQSUWY_acegikmoqsuwy{}]{0,63}){32}": true,
    "pattern expansion (?:[!#%')+/13579;=?ACEGIKMOQSUWY_acegikmoqsuwy{}]{0,63}){32}a": false,
    "pattern expansion (?:[^!#%')+\\-/13579;=?ACEGIKMOQSUWY\\[\\]_acegikmoqsuwy{}]{0,63}){32}": true,
    "pattern expansion (?:[^!#%')+\\-/13579;=?ACEGIKMOQSUWY\\[\\]_acegikmoqsuwy{}]{0,63}){32}a": false,
    "pattern expansion ^(?:[^!#%')+\\-/13579;=?ACEGIKMOQSUWY\\[\\]_acegikmoqsuwy{}]{0,64}){31}$": true,
    "pattern expansion (?:(?:(?:(?:a{64}){64}){64}){64})": false,
    "pattern expansion (?:a{64}){64}": false,
    "pattern expansion (?:a{64}){64}a": false,
    "pattern expansion ^(?:a{64}){63}a{62}$": false,
    "pattern expansion ^(?:a{64}){63}a{63}$": false,
    "pattern expansion (?:(?:ab|cd){64}){16}": false,
    "pattern expansion (?:(?:ab|cd){64}){16}e": false,
    "pattern expansion (?:a{64,}){63}": false,
    "pattern expansion (?:a{64,}){64}": false,
    "pattern expansion (?:a{1,64}){64}": false,
    "pattern expansion (?:a{1,64}){64}?": false,
    "pattern expansion (?:a{64}){64}b{0}": false,
    "pattern expansion (?:a{64}){64}(?:bc){0}": false,
    "pattern expansion (?:(?:(?:(?:a{64}){64}){64}){64}){0}": true,
    "pattern expansion (?:(?:(?:(?:a{64}){64}){64}){64}){0}b": true,
    "pattern expansion (?:a+){64}(?:b*){64}": true,
    "pattern expansion (?:\\w{64}){64}": false,
    "pattern expansion (?:\\W{64}){64}": false,
    "pattern expansion (?:\\D{64}){64}": false,
    "pattern expansion (?:\\S{64}){64}": false,
    "pattern expansion (?:.{64}){64}": false,
    "pattern expansion (?:[^a]{64}){64}": false,
    "pattern expansion (?:\\b\\w{63}){64}": false,
    "pattern expansion \\w{64}\\w{64}\\w{64}\\w{64}\\w{64}": true,
    "pattern near the size limit ^(?:(?:(?:a)*){64}){12}$": true,
    "pattern near the size limit ^(?:(?:(?:a)*){64}){13}$": false,
    "pattern near the size limit ^(?:(?:a)*){64}$": true,
    "pattern near the size limit ^(?:(?:(a)*){64}){12}$": true,
    "pattern near the size limit ^(?:(?:(a)*){64}){13}$": false,
    "pattern near the size limit ^(?:(a)*){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a)*)*)*)*)*){64}){4}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a)*)*)*)*)*){64}){5}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:a)*)*)*)*)*){64}$": true,
    "pattern near the size limit ^(?:(?:(((((a)*)*)*)*)*){64}){4}$": true,
    "pattern near the size limit ^(?:(?:(((((a)*)*)*)*)*){64}){5}$": false,
    "pattern near the size limit ^(?:(((((a)*)*)*)*)*){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){64}){1}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){64}){2}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){64}$": true,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){64}){1}$": true,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){64}){2}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){64}){1}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){49}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){50}$": false,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((((((((((((((((((((((a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){64}){1}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((((((((((((((((((((((a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){49}$": true,
    "pattern near the size limit ^(?:((((((((((((((((((((((((((((((((((((((((a)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*)*){50}$": false,
    "pattern near the size limit ^(?:(?:(?:a)+){64}){12}$": true,
    "pattern near the size limit ^(?:(?:(?:a)+){64}){13}$": false,
    "pattern near the size limit ^(?:(?:a)+){64}$": true,
    "pattern near the size limit ^(?:(?:(a)+){64}){12}$": true,
    "pattern near the size limit ^(?:(?:(a)+){64}){13}$": false,
    "pattern near the size limit ^(?:(a)+){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a)+)+)+)+)+){64}){4}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a)+)+)+)+)+){64}){5}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:a)+)+)+)+)+){64}$": true,
    "pattern near the size limit ^(?:(?:(((((a)+)+)+)+)+){64}){4}$": true,
    "pattern near the size limit ^(?:(?:(((((a)+)+)+)+)+){64}){5}$": false,
    "pattern near the size limit ^(?:(((((a)+)+)+)+)+){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){64}){1}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){64}){2}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){64}$": true,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){64}){1}$": true,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){64}){2}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){64}){1}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){49}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){50}$": false,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((((((((((((((((((((((a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){64}){1}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((((((((((((((((((((((a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){49}$": true,
    "pattern near the size limit ^(?:((((((((((((((((((((((((((((((((((((((((a)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+)+){50}$": false,
    "pattern near the size limit ^(?:(?:(?:a)?){64}){12}$": true,
    "pattern near the size limit ^(?:(?:(?:a)?){64}){13}$": false,
    "pattern near the size limit ^(?:(?:a)?){64}$": true,
    "pattern near the size limit ^(?:(?:(a)?){64}){12}$": true,
    "pattern near the size limit ^(?:(?:(a)?){64}){13}$": false,
    "pattern near the size limit ^(?:(a)?){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a)?)?)?)?)?){64}){4}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a)?)?)?)?)?){64}){5}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:a)?)?)?)?)?){64}$": true,
    "pattern near the size limit ^(?:(?:(((((a)?)?)?)?)?){64}){4}$": true,
    "pattern near the size limit ^(?:(?:(((((a)?)?)?)?)?){64}){5}$": false,
    "pattern near the size limit ^(?:(((((a)?)?)?)?)?){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){64}){1}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){64}){2}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){64}$": true,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){64}){1}$": true,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){64}){2}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){64}){1}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){49}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){50}$": false,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((((((((((((((((((((((a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){64}){1}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((((((((((((((((((((((a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){49}$": true,
    "pattern near the size limit ^(?:((((((((((((((((((((((((((((((((((((((((a)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?)?){50}$": false,
    "pattern near the size limit ^(?:(?:(?:a){0,}){64}){12}$": true,
    "pattern near the size limit ^(?:(?:(?:a){0,}){64}){13}$": false,
    "pattern near the size limit ^(?:(?:a){0,}){64}$": true,
    "pattern near the size limit ^(?:(?:(a){0,}){64}){12}$": true,
    "pattern near the size limit ^(?:(?:(a){0,}){64}){13}$": false,
    "pattern near the size limit ^(?:(a){0,}){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a){0,}){0,}){0,}){0,}){0,}){64}){4}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a){0,}){0,}){0,}){0,}){0,}){64}){5}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:a){0,}){0,}){0,}){0,}){0,}){64}$": true,
    "pattern near the size limit ^(?:(?:(((((a){0,}){0,}){0,}){0,}){0,}){64}){4}$": true,
    "pattern near the size limit ^(?:(?:(((((a){0,}){0,}){0,}){0,}){0,}){64}){5}$": false,
    "pattern near the size limit ^(?:(((((a){0,}){0,}){0,}){0,}){0,}){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){64}){1}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){64}){2}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){64}$": true,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){64}){1}$": true,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){64}){2}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){64}){1}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){1}$": false,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((((((((((((((((((((((a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){64}){1}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((((((((((((((((((((((a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){49}$": true,
    "pattern near the size limit ^(?:((((((((((((((((((((((((((((((((((((((((a){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){0,}){50}$": false,
    "pattern near the size limit ^(?:(?:(?:a){1,}){64}){7}$": true,
    "pattern near the size limit ^(?:(?:(?:a){1,}){64}){8}$": false,
    "pattern near the size limit ^(?:(?:a){1,}){64}$": true,
    "pattern near the size limit ^(?:(?:(a){1,}){64}){7}$": true,
    "pattern near the size limit ^(?:(?:(a){1,}){64}){8}$": false,
    "pattern near the size limit ^(?:(a){1,}){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a){1,}){1,}){1,}){1,}){1,}){64}){1}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:a){1,}){1,}){1,}){1,}){1,}){25}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:a){1,}){1,}){1,}){1,}){1,}){26}$": false,
    "pattern near the size limit ^(?:(?:(((((a){1,}){1,}){1,}){1,}){1,}){64}){1}$": false,
    "pattern near the size limit ^(?:(((((a){1,}){1,}){1,}){1,}){1,}){25}$": true,
    "pattern near the size limit ^(?:(((((a){1,}){1,}){1,}){1,}){1,}){26}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){64}){1}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1}$": false,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){64}){1}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((a){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){64}){1}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1}$": false,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((((((((((((((((((((((a){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){64}){1}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((((((((((((((((((((((a){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1,}){1}$": false,
    "pattern near the size limit ^(?:(?:(?:a){0,1}){64}){12}$": true,
    "pattern near the size limit ^(?:(?:(?:a){0,1}){64}){13}$": false,
    "pattern near the size limit ^(?:(?:a){0,1}){64}$": true,
    "pattern near the size limit ^(?:(?:(a){0,1}){64}){12}$": true,
    "pattern near the size limit ^(?:(?:(a){0,1}){64}){13}$": false,
    "pattern near the size limit ^(?:(a){0,1}){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a){0,1}){0,1}){0,1}){0,1}){0,1}){64}){4}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:a){0,1}){0,1}){0,1}){0,1}){0,1}){64}){5}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:a){0,1}){0,1}){0,1}){0,1}){0,1}){64}$": true,
    "pattern near the size limit ^(?:(?:(((((a){0,1}){0,1}){0,1}){0,1}){0,1}){64}){4}$": true,
    "pattern near the size limit ^(?:(?:(((((a){0,1}){0,1}){0,1}){0,1}){0,1}){64}){5}$": false,
    "pattern near the size limit ^(?:(((((a){0,1}){0,1}){0,1}){0,1}){0,1}){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){64}){1}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){64}){2}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){64}$": true,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){64}){1}$": true,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((a){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){64}){2}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((a){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){64}$": true,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){64}){1}$": false,
    "pattern near the size limit ^(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:(?:a){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){1}$": false,
    "pattern near the size limit ^(?:(?:((((((((((((((((((((((((((((((((((((((((a){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){64}){1}$": false,
    "pattern near the size limit ^(?:((((((((((((((((((((((((((((((((((((((((a){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){0,1}){1}$": false,
    "pattern near the size limit ^(?:(?:a|b){64}){12}$": true,
    "pattern near the size limit ^(?:(?:a|b){64}){13}$": false,
    "pattern near the size limit ^(?:a|b){64}$": true,
    "pattern near the size limit ^(?:(?:a|a){64}){12}$": true,
    "pattern near the size limit ^(?:(?:a|a){64}){13}$": false,
    "pattern near the size limit ^(?:a|a){64}$": true,
    "pattern near the size limit ^(?:(?:a|){64}){15}$": true,
    "pattern near the size limit ^(?:(?:a|){64}){16}$": false,
    "pattern near the size limit ^(?:a|){64}$": true,
    "pattern near the size limit ^(?:(?:a|b|c|d|e|f|g|h){64}){3}$": true,
    "pattern near the size limit ^(?:(?:a|b|c|d|e|f|g|h){64}){4}$": false,
    "pattern near the size limit ^(?:a|b|c|d|e|f|g|h){64}$": true,
    "pattern near the size limit ^(?:(?:(?:a|a)*){64}){9}$": true,
    "pattern near the size limit ^(?:(?:(?:a|a)*){64}){10}$": false,
    "pattern near the size limit ^(?:(?:a|a)*){64}$": true,
    "pattern near the size limit ^(?:(?:a?|b?){64}){9}$": true,
    "pattern near the size limit ^(?:(?:a?|b?){64}){10}$": false,
    "pattern near the size limit ^(?:a?|b?){64}$": true,
    "pattern near the size limit ^(?:(?:a*|b*){64}){9}$": true,
    "pattern near the size limit ^(?:(?:a*|b*){64}){10}$": false,
    "pattern near the size limit ^(?:a*|b*){64}$": true,
    "pattern near the size limit ^(?:(?:a{0,64}){64}){1}$": false,
    "pattern near the size limit ^(?:a{0,64}){31}$": true,
    "pattern near the size limit ^(?:a{0,64}){32}$": false,
    "pattern near the size limit ^(?:(?:a{1,64}){64}){1}$": false,
    "pattern near the size limit ^(?:a{1,64}){31}$": true,
    "pattern near the size limit ^(?:a{1,64}){32}$": false,
    "pattern near the size limit ^(?:(?:(?:a{0,8}){8}){64}){1}$": false,
    "pattern near the size limit ^(?:(?:a{0,8}){8}){28}$": true,
    "pattern near the size limit ^(?:(?:a{0,8}){8}){29}$": false,
    "pattern near the size limit ^(?:(?:(?:\\ba)*){64}){10}$": true,
    "pattern near the size limit ^(?:(?:(?:\\ba)*){64}){11}$": false,
    "pattern near the size limit ^(?:(?:\\ba)*){64}$": true,
    "pattern near the size limit ^(?:(?:\\w*\\W?){64}){10}$": true,
    "pattern near the size limit ^(?:(?:\\w*\\W?){64}){11}$": false,
    "pattern near the size limit ^(?:\\w*\\W?){64}$": true,
    "array nesting depth 6": true,
    "array nesting depth 7": true,
    "array nesting depth 8": true,
    "array nesting depth 9": true,
    "array nesting depth 10": true,
    "array nesting depth 11": true,
    "array nesting depth 12": true,
    "array nesting depth 16": true,
    "array nesting depth 17": false,
    "array nesting depth 32": false,
    "array nesting depth 33": false,
    "stages": true,
    "stages not an object": false,
    "stage key \"0\"": true,
    "stage key \"1\"": true,
    "stage key \"255\"": true,
    "stage key \"01\"": false,
    "stage key \"00\"": false,
    "stage key \"+1\"": false,
    "stage key \" 1\"": false,
    "stage key \"1 \"": false,
    "stage key \"1.0\"": false,
    "stage key \"0x1\"": false,
    "stage key \"-0\"": false,
    "stage key \"\"": false,
    "stage key \"256\"": false,
    "stage key \"1e1\"": false,
    "stage key \"١\"": false,
    "stage key \"a\"": false,
    "stage keys \"1\" and \"01\" in one spec": false,
    "fields not an array": false,
    "empty fields": true,
    "spec is an array": false,
    "spec is null": false,
    "enum of 256 values": true,
    "enum of 257 values": false,
    "disposition public": true,
    "disposition secret": false,
    "disposition null": false,
    "disposition true": false,
    "disposition PRIVATE": false,
    "formatFromField": true,
    "formatFromField naming no sibling": true,
    "formatFromField empty": false,
    "formatFromField a number": false,
    "formatFromField null": false,
    "formatFromField on an integer field": true,
    "private set with its blinding field": true,
    "private set, the blinding field first": true,
    "private set without a blinding field": false,
    "private set with two blinding fields": false,
    "a blinding field alone": false,
    "a blinding field beside a public field": false,
    "a mixed set": false,
    "a mixed set, public written out": false,
    "a public field beside a private object": false,
    "a private field nested in a public object": false,
    "a private field nested in a public object named v": false,
    "a private field nested in a public object, with a blinding field": false,
    "a private field two objects deep in a public object, with a blinding field": false,
    "a private item in a public array": false,
    "a private item in a public array, with a blinding field": false,
    "a private field nested in a private object, with a blinding field": true,
    "a private field nested in a public stage object": false,
    "blinding false": false,
    "blinding as a string": false,
    "blinding null": false,
    "a blinding field of type integer": false,
    "a blinding field of type enum": false,
    "a blinding field with no format": false,
    "a blinding field of format bytes-hex": false,
    "a blinding field not required": false,
    "a blinding field public": false,
    "a blinding field with no disposition": false,
    "a blinding field with a default": false,
    "a blinding field with a default of the wrong type": false,
    "a blinding field nested in an object": false,
    "a blinding field as an array item": false,
    "a private stage with its blinding field": true,
    "a private stage without a blinding field": false,
    "a mixed stage": false,
    "a public stage with a blinding field": false,
    "an empty stage": true,
    "emptyAnchor true": true,
    "emptyAnchor false": false,
    "emptyAnchor as a string": false,
    "emptyAnchor beside a top-level default": false,
    "emptyAnchor beside a stage field's default": true,
};

// ── Canonical bytes ─────────────────────────────────────────────────────────

/** Contents whose canonical JSON (`canonicalize`, the bytes a clause's data
 *  hash covers) keeps every key, those named as a property every object
 *  inherits among them. A reader hashes the bytes it is handed and reads the
 *  content from them, so a key the SDK's form dropped would leave two
 *  contents under one data hash. */
const DATA_CASES: { label: string; content: unknown; bytes: string }[] = [
    { label: "a key named __proto__, value A", content: JSON.parse('{"x":1,"__proto__":"A"}') as unknown , bytes: '{"__proto__":"A","x":1}' },
    { label: "a key named __proto__, value B", content: JSON.parse('{"x":1,"__proto__":"B"}') as unknown , bytes: '{"__proto__":"B","x":1}' },
    { label: "a key named __proto__ holding an object", content: JSON.parse('{"__proto__":{"y":2},"x":1}') as unknown , bytes: '{"__proto__":{"y":2},"x":1}' },
    { label: "a nested key named __proto__", content: JSON.parse('{"o":{"z":1,"__proto__":"A"}}') as unknown , bytes: '{"o":{"__proto__":"A","z":1}}' },
    { label: "keys named constructor, toString and prototype", content: JSON.parse('{"toString":"t","prototype":"p","constructor":"c"}') as unknown , bytes: '{"constructor":"c","prototype":"p","toString":"t"}' },
];

function build() {
    return {
        values: VALUE_CASES.flatMap(({ group, field, values }) =>
            values.map((value) => ({ group, field, value, ok: verdict([field], { v: value }) })),
        ),
        contents: CONTENT_CASES.map(({ label, fields, content }) => ({ label, fields, content, ok: verdict(fields, content) })),
        specs: SPEC_CASES.map(({ label, spec }) => ({ label, spec, ok: parseClauseSpec(spec).ok })),
        signed: SIGNED_CASES.map(({ label, spec, content }) => {
            const parsed = parseClauseSpec(spec);
            if (!parsed.ok) throw new Error(`signed case ${label}: the spec does not parse`);
            return { label, ok: validateSignedContent(content, parsed.spec).ok };
        }),
        encodings: ENCODE_CASES.map(({ label, fields, stages, stage, content }) => {
            const parsed = parseClauseSpec(specOf(fields, stages));
            if (!parsed.ok) throw new Error(`encode case ${label}: the spec does not parse`);
            const options = stage === undefined ? {} : { stage };
            if (!validateContent(content, parsed.spec, options).ok) throw new Error(`encode case ${label}: the content does not validate`);
            return { label, fields, stages, encoded: encodeContentFromSpec(parsed.spec, content, options) };
        }),
        dataBytes: DATA_CASES.map(({ label, content }) => ({ label, bytes: canonicalize(content) })),
    };
}

describe("Clause-engine vectors — each case gives the verdict or the bytes stated beside it", () => {
    const built = build();

    it("every value case gives its stated verdict", () => {
        const letters: Record<string, string> = {};
        for (const c of built.values) letters[c.group] = (letters[c.group] ?? "") + (c.ok === null ? "-" : c.ok ? "T" : "F");
        expect(letters).toEqual(VALUE_VERDICTS);
    });

    it("every whole-content case gives its stated verdict", () => {
        expect(new Set(CONTENT_CASES.map((c) => c.label)).size, "content labels are unique").toBe(CONTENT_CASES.length);
        expect(Object.fromEntries(built.contents.map((c) => [c.label, c.ok]))).toEqual(CONTENT_VERDICTS);
    });

    it("the parser accepts exactly the spec cases stated", () => {
        expect(new Set(SPEC_CASES.map((c) => c.label)).size, "spec labels are unique").toBe(SPEC_CASES.length);
        expect(Object.fromEntries(built.specs.map((c) => [c.label, c.ok]))).toEqual(SPEC_VERDICTS);
    });

    it("the sign gate gives every signed case its stated verdict", () => {
        built.signed.forEach((c, i) => expect(c.ok, c.label).toBe(SIGNED_CASES[i].ok));
    });

    it("every encode case encodes to its stated bytes", () => {
        built.encodings.forEach((c, i) => expect(c.encoded, c.label).toBe(ENCODE_CASES[i].encoded));
    });

    it("the vectors hold both verdicts in every group that can have both", () => {
        expect(built.values.some((c) => c.ok === true)).toBe(true);
        expect(built.values.some((c) => c.ok === false)).toBe(true);
        // `null`: the field's own spec does not parse — a pattern outside the
        // portable core, which the parser refuses before any value is read.
        expect(built.values.some((c) => c.ok === null)).toBe(true);
        expect(
            built.values.filter((c) => c.ok === null).every((c) => "pattern" in c.field),
            "only a pattern makes a value case's spec unparseable",
        ).toBe(true);
        expect(built.specs.some((c) => c.ok)).toBe(true);
        expect(built.specs.some((c) => !c.ok)).toBe(true);
        expect(built.signed.some((c) => c.ok)).toBe(true);
        expect(built.signed.some((c) => !c.ok)).toBe(true);
    });

    it("every pattern near the size limit that parses builds its automaton, and none past it parses", () => {
        const patterns = nearLimitPatterns();
        expect(patterns.length).toBeGreaterThan(150);
        let parsed = 0;
        for (const pattern of patterns) {
            const size = portablePatternSize(pattern);
            const ok = parseClauseSpec(specOf(f({ type: "string", pattern }))).ok;
            expect(ok, pattern).toBe(size !== null);
            if (size === null) continue;
            parsed++;
            expect(size, pattern).toBeLessThanOrEqual(4096);
            expect(portablePatternMatches(pattern, "a"), pattern).not.toBeNull();
        }
        expect(parsed).toBeGreaterThan(50);
    });

    it("the canonical bytes keep a key named __proto__, so two contents that differ there differ in their bytes", () => {
        built.dataBytes.forEach((c, i) => expect(c.bytes, c.label).toBe(DATA_CASES[i].bytes));
        expect(Object.prototype).not.toHaveProperty("y");
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
 * Every attribute the SDK's parser reads has vectors. The attribute set is
 * derived from the published schema (`sdk/src/clauses/clause-spec.schema.json`),
 * walked from its root through every reference, `block` left out because the
 * parser reads none of it. Each attribute appears in a spec of the shared
 * vectors that parses, and in one the parser refuses for that attribute (an
 * error path that ends in its name). An attribute the parser never refuses
 * on its own stands in the table below with the reason. So an attribute added
 * to the schema and the parser fails here until the vectors hold it.
 */
const NO_REFUSING_CASE: Readonly<Record<string, string>> = {};

/** The attribute names the schema declares on a spec or a field, `block` left out. */
function schemaAttributes(): Set<string> {
    const schema = JSON.parse(readFileSync(path.resolve(__dirname, "../../src/clauses/clause-spec.schema.json"), "utf8"));
    const names = new Set<string>();
    const seen = new Set<unknown>();
    const walk = (node: unknown): void => {
        if (node === null || typeof node !== "object" || seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) { node.forEach(walk); return; }
        const obj = node as Record<string, unknown>;
        if (typeof obj.$ref === "string") {
            const target = obj.$ref.replace(/^#\//, "").split("/").reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], schema);
            walk(target);
        }
        for (const [key, value] of Object.entries(obj)) {
            if (key === "$defs") continue;
            if (key === "properties" && value !== null && typeof value === "object") {
                for (const [name, sub] of Object.entries(value as Record<string, unknown>)) {
                    if (name === "block") continue;
                    names.add(name);
                    walk(sub);
                }
                continue;
            }
            walk(value);
        }
    };
    walk(schema);
    return names;
}

/** The attribute names a raw spec carries, on the spec and on each field, at every depth. */
function attributesOf(spec: unknown): Set<string> {
    const names = new Set<string>();
    const field = (raw: unknown): void => {
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return;
        const obj = raw as Record<string, unknown>;
        for (const key of Object.keys(obj)) names.add(key);
        field(obj.items);
        if (Array.isArray(obj.fields)) obj.fields.forEach(field);
    };
    if (spec === null || typeof spec !== "object" || Array.isArray(spec)) return names;
    const top = spec as Record<string, unknown>;
    for (const key of Object.keys(top)) names.add(key);
    if (Array.isArray(top.fields)) top.fields.forEach(field);
    if (top.stages !== null && typeof top.stages === "object") {
        for (const set of Object.values(top.stages as Record<string, unknown>)) if (Array.isArray(set)) set.forEach(field);
    }
    return names;
}

/** The attribute an error path ends in: its last named segment, a valueLabels key or an index read past. */
function attributeOfPath(errorPath: string): string | undefined {
    const segments = errorPath.split(".").map((segment) => segment.replace(/\[\d+\]$/, ""));
    const labels = segments.indexOf("valueLabels");
    const kept = labels === -1 ? segments : segments.slice(0, labels + 1);
    for (let i = kept.length - 1; i >= 0; i--) {
        if (kept[i] !== "$" && !/^\d+$/.test(kept[i])) return kept[i];
    }
    return undefined;
}

describe("The vectors cover the published format", () => {
    it("every attribute the schema declares has a parsing spec and a refusing one in the vectors, or a reason in the table", () => {
        const built = build();
        const specs: unknown[] = [
            ...built.values.map((c) => specOf([c.field])),
            ...built.contents.map((c) => specOf(c.fields)),
            ...built.specs.map((c) => c.spec),
            ...built.encodings.map((c) => specOf(c.fields, c.stages)),
        ];
        const parsing = new Set<string>();
        const refused = new Set<string>();
        for (const spec of specs) {
            const parsed = parseClauseSpec(spec);
            if (parsed.ok) {
                for (const name of attributesOf(spec)) parsing.add(name);
            } else {
                for (const error of parsed.errors) {
                    const name = attributeOfPath(error.path);
                    if (name !== undefined) refused.add(name);
                }
            }
        }
        const attributes = schemaAttributes();
        expect(attributes.size).toBeGreaterThan(20);
        for (const name of Object.keys(NO_REFUSING_CASE)) {
            expect(attributes.has(name), `${name} is in the table and not in the schema`).toBe(true);
            expect(refused.has(name), `${name} is in the table and has a refusing case`).toBe(false);
        }
        const unparsed = [...attributes].filter((name) => !parsing.has(name));
        const unrefused = [...attributes].filter((name) => !refused.has(name) && !(name in NO_REFUSING_CASE));
        expect(unparsed, "attributes no parsing spec of the vectors carries").toEqual([]);
        expect(unrefused, "attributes no refused spec of the vectors is refused for, and the table does not name").toEqual([]);
    });

    it("the vectors hold the grain cap, the disposition, formatFromField and the blinding field, each with both verdicts", () => {
        const built = build();
        const holds = (needle: RegExp, ok: boolean) =>
            [...built.values.map((c) => ({ text: JSON.stringify(c.field), ok: c.ok })),
             ...built.contents.map((c) => ({ text: JSON.stringify(c.fields), ok: c.ok })),
             ...built.specs.map((c) => ({ text: JSON.stringify(c.spec), ok: c.ok }))]
                .some((c) => needle.test(c.text) && c.ok === ok);
        for (const needle of [/"geohash"/, /"format":"h3"/, /"format":"s2"/, /"format":"olc"/, /"disposition":"private"/, /"formatFromField"/, /"blinding":true/]) {
            expect(holds(needle, true), `${needle} accepted`).toBe(true);
            expect(holds(needle, false), `${needle} refused`).toBe(true);
        }
    });
});
