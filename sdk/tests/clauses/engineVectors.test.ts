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
    ].map((pattern) => ({
        group: `screen ${pattern}`,
        field: str({ pattern }),
        values: ["zzz", "a", "aa", "ab", "aab", "abc", "(a)", "+", "a+", ""],
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
];

// ── Specs ───────────────────────────────────────────────────────────────────

const f = (extra: Field): Field[] => [{ name: "v", required: true, ...extra }];
const nest = (depth: number): Field =>
    depth === 0
        ? { name: "leaf", type: "boolean", required: true }
        : { name: `n${depth}`, type: "object", required: true, fields: [nest(depth - 1)] };

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
    { label: "stages", spec: specOf(f({ type: "boolean" }), { 1: f({ type: "integer" }) }) },
    { label: "stages not an object", spec: specOf(f({ type: "boolean" }), []) },
    { label: "fields not an array", spec: specOf({}) },
    { label: "empty fields", spec: specOf([]) },
    { label: "spec is an array", spec: [] },
    { label: "spec is null", spec: null },
];

/** Encoded bytes for the values whose bytes a verdict alone does not show. */
const ENCODE_CASES: { label: string; fields: Field[]; content: Record<string, unknown> }[] = [
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
        encodings: ENCODE_CASES.map(({ label, fields, content }) => {
            const parsed = parseClauseSpec(specOf(fields));
            if (!parsed.ok) throw new Error(`encode case ${label}: the spec does not parse`);
            if (!validateContent(content, parsed.spec).ok) throw new Error(`encode case ${label}: the content does not validate`);
            return { label, fields, content, encoded: encodeContentFromSpec(parsed.spec, content) };
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
        expect(built.values.every((c) => c.ok !== null), "every value case's field spec parses").toBe(true);
        expect(built.specs.some((c) => c.ok)).toBe(true);
        expect(built.specs.some((c) => !c.ok)).toBe(true);
    });
});
