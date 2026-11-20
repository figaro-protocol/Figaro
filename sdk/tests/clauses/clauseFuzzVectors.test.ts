/**
 * Clause fuzz vectors — the generated leg of the clause-engine lock.
 *
 * The clause engine exists twice: Layer A here (`src/clauses/`), and the
 * Rust mirror the guest runs (`prover/clause`). The fixed conformance
 * vectors lock the two on hand-written cases. This file GENERATES cases
 * from a seed and records what Layer A did with each:
 *
 *   - the spec: every protocol clause in `clauses/`, and generated specs —
 *     clauses nobody has seen, some of them malformed; their fields carry
 *     dispositions, `formatFromField` and blinding fields, in private sets
 *     that keep the set's rules and in sets that break one of them;
 *   - the content: drawn from the spec's own field shapes — half of the
 *     draws aim inside every bound, half also cross them (a wrong type, a
 *     bound crossed, a geohash finer than its grain cap, a required field
 *     dropped, an unknown field added); strings leave ASCII in both;
 *   - the answers: whether the spec parses, whether the content validates,
 *     and the canonical ABI bytes when it does.
 *
 * `prover/clause/tests/fuzz_vectors.rs` reads the vectors and must give the
 * same three answers. Layer A's answer is the oracle; the generator asserts
 * nothing about what a case deserves.
 *
 * Runs only under `CLAUSE_FUZZ_SEED=<n>` (`scripts/test-cross-impl-fuzz.sh`
 * sets it), writing `test/fixtures/streams/clauses.jsonl`, one JSON object per
 * line. Without the variable the file asserts the generator itself: the
 * same seed yields the same vectors.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    contentFieldsFor,
    encodeContentFromSpec,
    GEOHASH_FORMAT,
    geohashCapturePrecision,
    PRIVATE_GEOHASH_MAX_PRECISION,
    parseClauseSpec,
    stageOfKey,
    validateContent,
    portablePatternSize,
    MAX_PATTERN_WORK,
    MAX_CONTENT_PATTERN_WORK,
    type ClauseSpec,
    type FieldDisposition,
    type FieldSpec,
} from "../../src/clauses/index.js";

/** The message `validateContent` gives when the geohash grain cap refuses a value. */
const GRAIN_REFUSAL = /geohash carries at most \d+ characters/;

/** The messages `parseClauseSpec` gives when a private set's rules refuse a
 *  spec: its blinding field, and the mix of public and private fields. */
const PRIVATE_SET_REFUSAL = /blinding|mix public and private/;

const CLAUSES_DIR = path.resolve(__dirname, "../../../clauses");
const OUT_PATH = path.resolve(__dirname, "../../../test/fixtures/streams/clauses.jsonl");

// ── Content, drawn from a field's shape ─────────────────────────────────────

const HEX = "0123456789abcdef";
const hexArb = (bytes: fc.Arbitrary<number>) =>
    bytes.chain((n) =>
        fc
            .array(fc.constantFrom(...HEX.split("")), { minLength: n * 2, maxLength: n * 2 })
            .map((cs) => `0x${cs.join("")}`),
    );

/** Any string: ASCII most of the time, whole graphemes outside it otherwise. */
const anyString = (min: number, max: number) =>
    fc.oneof(
        { weight: 3, arbitrary: fc.string({ minLength: min, maxLength: max }) },
        { weight: 1, arbitrary: fc.string({ unit: "grapheme", minLength: min, maxLength: max }) },
    );

/** The alphabet a geohash is written in. */
const GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz";

/** A geohash-like string. `careful` draws stay inside the grain cap of the
 *  disposition that governs the value, but one in five is one character past
 *  it: in content whose every other field is inside its bounds, that is a
 *  case the cap alone refuses. The others run past the private cap. */
function geohashArb(disposition: FieldDisposition | undefined, careful: boolean): fc.Arbitrary<string> {
    const unit = fc.constantFrom(...GEOHASH_ALPHABET.split(""));
    const cap = geohashCapturePrecision(disposition);
    if (!careful) return fc.string({ unit, minLength: 1, maxLength: PRIVATE_GEOHASH_MAX_PRECISION + 2 });
    return fc.oneof(
        { weight: 4, arbitrary: fc.string({ unit, minLength: 1, maxLength: cap }) },
        { weight: 1, arbitrary: fc.string({ unit, minLength: cap + 1, maxLength: cap + 1 }) },
    );
}

/** Values at both edges of a large pattern's work budget: the longest the
 *  pattern runs on, and one character more, which both engines refuse. Only
 *  for a pattern of expanded size 256 or more, so a value stays under
 *  16,385 characters and the stream stays small. */
function workEdgeArb(pattern: string): fc.Arbitrary<string> | null {
    const size = portablePatternSize(pattern);
    if (size === null || size < 256) return null;
    const edge = Math.floor(MAX_PATTERN_WORK / size);
    return fc
        .tuple(fc.constantFrom(edge, edge + 1), fc.constantFrom("a", "b", "-", "a-"))
        .map(([length, unit]) => unit.repeat(Math.ceil(length / unit.length)).slice(0, length));
}

/** `careful` draws aim inside the field's bounds; the others also cross them.
 *  `disposition` is the one that governs the value: the field's own, or the
 *  array field's for an item. */
function stringArb(
    field: Extract<FieldSpec, { type: "string" }>,
    careful: boolean,
    disposition: FieldDisposition | undefined,
): fc.Arbitrary<unknown> {
    const min = field.minLength ?? 0;
    const max = Math.max(min, Math.min(field.maxLength ?? min + 24, min + 48));
    // A format named by a sibling resolves at validation; a geohash is the
    // one whose grain the engines cap, so the draw is geohash-like.
    if (field.formatFromField !== undefined) {
        return careful ? geohashArb(disposition, true) : fc.oneof(geohashArb(disposition, false), anyString(min, max));
    }
    switch (field.format) {
        case GEOHASH_FORMAT:
            return careful ? geohashArb(disposition, true) : fc.oneof(geohashArb(disposition, false), anyString(min, max));
        case "bytes32-hex":
            return hexArb(careful ? fc.constant(32) : fc.constantFrom(32, 31, 33, 0));
        case "address-hex":
            return hexArb(careful ? fc.constant(20) : fc.constantFrom(20, 19, 32));
        case "bytes-hex":
            return hexArb(fc.integer({ min: 0, max: 40 }));
        case "iso-datetime": {
            const wellFormed = fc
                .date({ min: new Date("1970-01-01T00:00:00Z"), max: new Date("2100-01-01T00:00:00Z"), noInvalidDate: true })
                .map((d) => d.toISOString());
            if (careful) return wellFormed;
            return fc.oneof(
                wellFormed,
                fc.constantFrom("2026-01-01", "2026-01-01T00:00:00", "2026-13-01T00:00:00Z", "2026-01-01T00:00:00+02:00"),
            );
        }
        default:
            if (field.pattern !== undefined) {
                // Short values over the pattern alphabet's letters hit a
                // generated pattern far more often than free strings do.
                const near = fc.string({ unit: fc.constantFrom(..."abc019 .-UN"), minLength: min, maxLength: Math.max(min, 6) });
                const long = workEdgeArb(field.pattern);
                const arms = long === null ? [near] : [near, long];
                try {
                    const matching = fc.stringMatching(new RegExp(field.pattern));
                    return careful ? fc.oneof(matching, ...arms) : fc.oneof(matching, ...arms, anyString(min, max));
                } catch {
                    return fc.oneof(...arms, anyString(min, max));
                }
            }
            return anyString(min, max);
    }
}

function valueArb(
    field: FieldSpec,
    careful: boolean,
    depth = 0,
    disposition: FieldDisposition | undefined = field.disposition,
): fc.Arbitrary<unknown> {
    switch (field.type) {
        case "string":
            return stringArb(field, careful, disposition);
        case "integer": {
            const lo = field.min ?? -1000;
            const hi = Math.max(lo, field.max ?? lo + 1000);
            const inside = fc.integer({ min: Math.max(lo, -(2 ** 31)), max: Math.min(hi, 2 ** 31 - 1) });
            if (careful) return fc.oneof({ weight: 4, arbitrary: inside }, { weight: 1, arbitrary: fc.constantFrom(lo, hi) });
            return fc.oneof(
                { weight: 4, arbitrary: inside },
                { weight: 1, arbitrary: fc.constantFrom(lo - 1, hi + 1, lo, hi, 0, -1) },
                { weight: 1, arbitrary: fc.constantFrom(1.5, 1e21, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER) },
            );
        }
        case "bigint": {
            const lo = field.min !== undefined ? BigInt(field.min) : 0n;
            const top = field.max !== undefined ? BigInt(field.max) : (1n << 256n) - 1n;
            const hi = top < lo ? lo : top;
            const inside = fc.bigInt({ min: lo, max: hi }).map((v) => v.toString());
            if (careful) return inside;
            return fc.oneof(
                { weight: 4, arbitrary: inside },
                { weight: 1, arbitrary: fc.bigInt({ min: -(1n << 255n), max: 1n << 257n }).map((v) => v.toString()) },
                { weight: 1, arbitrary: fc.constantFrom("", "0x10", " 1", "1 ", "+1", "-0", "007", "1e3", "1.0") },
            );
        }
        case "boolean":
            return fc.boolean();
        case "enum":
            if (careful) return fc.constantFrom(...field.values);
            return fc.oneof(
                { weight: 6, arbitrary: fc.constantFrom(...field.values) },
                { weight: 1, arbitrary: fc.string({ maxLength: 8 }) },
            );
        case "array": {
            const min = field.minItems ?? 0;
            const max = Math.max(min, Math.min(field.maxItems ?? min + 3, min + 3));
            // The array field's disposition governs its items.
            const item = valueArb(field.items, careful, depth + 1, field.disposition);
            const inside = fc.array(item, { minLength: min, maxLength: max });
            if (careful) return inside;
            return fc.oneof(
                { weight: 6, arbitrary: inside },
                { weight: 1, arbitrary: fc.array(item, { maxLength: max + 2 }) },
            );
        }
        case "object":
            return contentArb(field.fields, careful, depth + 1);
    }
}

/** A wrong value for any field: the damage a careless or hostile caller does. */
const damageArb: fc.Arbitrary<unknown> = fc.oneof(
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    fc.string({ maxLength: 6 }),
    fc.constant([]),
    fc.constant({}),
);

function contentArb(
    fields: readonly FieldSpec[],
    careful: boolean,
    depth = 0,
): fc.Arbitrary<Record<string, unknown>> {
    const entries = fields.map((field) =>
        fc
            .record({
                roll: fc.integer({ min: 0, max: 99 }),
                value: valueArb(field, careful, depth),
                damage: damageArb,
            })
            .map(({ roll, value, damage }) => {
                if (!careful && roll < 4) return [field.name, damage] as const; // a wrong type
                if (!careful && roll < 8) return null; // absent, required or not
                if (!field.required && roll < 40) return null; // an optional field left out
                return [field.name, value] as const;
            }),
    );
    const extraArb = careful
        ? fc.constant(null)
        : fc.option(fc.tuple(fc.string({ minLength: 1, maxLength: 6 }), damageArb), { freq: 10 });
    return fc.tuple(fc.tuple(...entries), extraArb).map(([pairs, extra]) => {
        const out: Record<string, unknown> = {};
        for (const pair of pairs) if (pair !== null) out[pair[0]] = pair[1];
        if (extra !== null && !["__proto__", "constructor", "prototype"].includes(extra[0])) {
            out[extra[0]] = extra[1];
        }
        return out;
    });
}

// ── Specs nobody has seen ───────────────────────────────────────────────────

/** A pattern: a known one, or characters drawn from the alphabet regexes are
 *  written in — most draws are outside the portable core, some inside it,
 *  and the parse verdict on each is one of the three answers. */
const PATTERN_ALPHABET = [..."abc019 .*+?()[]{}|^$\\-,:=!<>&~#dwsbDWSB", "(?:", "(?=", "(?!", "\\d", "\\w", "\\.", "[a-z]", "[^0-9]", "{2}", "{1,3}"];
const patternArb = fc.oneof(
    { weight: 2, arbitrary: fc.constantFrom("^[a-z]+$", "^[0-9a-f]{4}$", "^(a|b)*c$", "^UN[0-9]{4}$", "^[A-Za-z0-9 ./-]{0,8}$") },
    {
        weight: 3,
        arbitrary: fc
            .array(fc.constantFrom(...PATTERN_ALPHABET), { minLength: 1, maxLength: 8 })
            .map((parts) => parts.join("")),
    },
    // Large patterns: a short body under two counts, its expanded size on
    // both sides of MAX_PATTERN_EXPANSION, so the parse limit and the work
    // budget are both crossed.
    {
        weight: 2,
        arbitrary: fc
            .tuple(
                fc.constantFrom("a", "[a-c]", "\\w", "a|b", "a*", "(?:a)+", "(a)?", "a?b", "(?:(?:a)*)*", "\\ba"),
                fc.integer({ min: 1, max: 64 }),
                fc.integer({ min: 1, max: 64 }),
            )
            .map(([body, m, n]) => `^(?:(?:${body}){${m}}){${n}}$`),
    },
);

const nameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,7}$/);

/** A field's disposition: absent most of the time, sometimes either value,
 *  sometimes one no engine admits. */
const dispositionArb = fc.oneof(
    { weight: 12, arbitrary: fc.constant(undefined) },
    { weight: 2, arbitrary: fc.constantFrom("public", "private") },
    { weight: 1, arbitrary: fc.constantFrom("secret", "PRIVATE", null, true) as fc.Arbitrary<unknown> },
);

/** A string field's `formatFromField`: absent most of the time, a drawn name
 *  (a sibling's now and then), or a value no engine admits. */
const formatFromFieldArb = fc.oneof(
    { weight: 12, arbitrary: fc.constant(undefined) },
    { weight: 2, arbitrary: nameArb },
    { weight: 1, arbitrary: fc.constantFrom("", 5, null) as fc.Arbitrary<unknown> },
);

/** A field the key leaves out when its drawn value is `undefined`. */
const withoutUndefined = (field: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(field).filter(([, v]) => v !== undefined));

function fieldSpecArb(depth: number): fc.Arbitrary<Record<string, unknown>> {
    return fieldSpecShapeArb(depth).chain((field) =>
        dispositionArb.map((disposition) => withoutUndefined({ ...field, disposition })),
    );
}

function fieldSpecShapeArb(depth: number): fc.Arbitrary<Record<string, unknown>> {
    const base = { name: nameArb, required: fc.boolean() };
    const leaves = [
        fc.record(
            {
                ...base,
                type: fc.constant("string"),
                format: fc.constantFrom("bytes32-hex", "address-hex", "bytes-hex", "iso-datetime", "uri", "free-form", GEOHASH_FORMAT),
                formatFromField: formatFromFieldArb,
                minLength: fc.integer({ min: 0, max: 4 }),
                maxLength: fc.integer({ min: 0, max: 40 }),
                pattern: patternArb,
            },
            { requiredKeys: ["name", "required", "type", "formatFromField"] },
        ).map(withoutUndefined),
        fc.record(
            { ...base, type: fc.constant("integer"), min: fc.integer({ min: -50, max: 50 }), max: fc.integer({ min: -50, max: 500 }) },
            { requiredKeys: ["name", "required", "type"] },
        ),
        fc.record(
            {
                ...base,
                type: fc.constant("bigint"),
                min: fc.bigInt({ min: 0n, max: 1n << 64n }).map(String),
                max: fc.bigInt({ min: 0n, max: 1n << 200n }).map(String),
            },
            { requiredKeys: ["name", "required", "type"] },
        ),
        fc.record({ ...base, type: fc.constant("boolean") }),
        fc.record({
            ...base,
            type: fc.constant("enum"),
            values: fc.uniqueArray(fc.stringMatching(/^[a-z-]{1,6}$/), { minLength: 1, maxLength: 5 }),
        }),
    ];
    if (depth >= 2) return fc.oneof(...leaves);
    return fc.oneof(
        ...leaves.map((arbitrary) => ({ weight: 3, arbitrary })),
        {
            weight: 1,
            arbitrary: fc.record(
                {
                    ...base,
                    type: fc.constant("array"),
                    items: fieldSpecArb(depth + 1),
                    minItems: fc.integer({ min: 0, max: 2 }),
                    maxItems: fc.integer({ min: 0, max: 4 }),
                },
                { requiredKeys: ["name", "required", "type", "items"] },
            ),
        },
        {
            weight: 1,
            arbitrary: fc.record({
                ...base,
                type: fc.constant("object"),
                fields: fc.uniqueArray(fieldSpecArb(depth + 1), { selector: (f) => f.name, minLength: 1, maxLength: 3 }),
            }),
        },
    );
}

const fieldsArb = fc.uniqueArray(fieldSpecArb(0), { selector: (f) => f.name, minLength: 1, maxLength: 5 });

/** A set's blinding field, in its one shape. */
const BLINDING = { name: "blind", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true } as const;

/** A blinding field each of whose shapes breaks one rule. */
const BROKEN_BLINDINGS: Record<string, unknown>[] = [
    { ...BLINDING, required: false },
    { ...BLINDING, format: "bytes-hex" },
    { ...BLINDING, disposition: "public" },
    { ...BLINDING, default: `0x${"00".repeat(32)}` },
    { ...BLINDING, blinding: false },
    { ...BLINDING, blinding: "true" },
    { name: "blind", type: "integer", required: true, disposition: "private", blinding: true },
];

const privatized = (fields: Record<string, unknown>[]) => fields.map((f) => ({ ...f, disposition: "private" }));

/**
 * One field set (the top-level `fields`, or one stage): most draws keep the
 * fields as drawn, and the rest shape the set around the private set's rules
 * (`parseClauseSpec`), a valid private set or one that breaks one rule, or
 * around a sibling whose value names a field's format.
 */
const fieldSetArb: fc.Arbitrary<Record<string, unknown>[]> = fc
    .tuple(fieldsArb, fc.integer({ min: 0, max: 11 }), fc.nat())
    .map(([fields, roll, pick]) => {
        switch (roll) {
            case 5: return [...privatized(fields), BLINDING];
            case 6: return [BLINDING, ...privatized(fields)];
            case 7: return privatized(fields);
            case 8: return [...privatized(fields), BLINDING, { ...BLINDING, name: "blind2" }];
            case 9: return [...privatized(fields), BROKEN_BLINDINGS[pick % BROKEN_BLINDINGS.length]];
            case 10: {
                // A sibling whose committed value, or its default, names the format.
                const std = pick % 2 === 0
                    ? { name: "std", type: "enum", values: [GEOHASH_FORMAT, "plus-code"], required: false, default: GEOHASH_FORMAT }
                    : { name: "std", type: "string", required: false };
                const loc = { name: "loc", type: "string", required: true, formatFromField: "std", ...(pick % 3 === 0 && { format: GEOHASH_FORMAT }) };
                return pick % 4 === 1 ? [...privatized([...fields, std, loc]), BLINDING] : [...fields, std, loc];
            }
            case 11:
                // A blinding field where none may stand: beside public fields, or nested.
                return pick % 2 === 0
                    ? [...fields, BLINDING]
                    : [...privatized(fields), { name: "inner", type: "object", required: true, disposition: "private", fields: [BLINDING] }, BLINDING];
            default:
                return fields;
        }
    });

/** A stage key: most draws in the one spelling a stage key has, the decimal
 *  of an integer 0..255; the rest in spellings both engines refuse. */
const stageKeyArb: fc.Arbitrary<string> = fc.oneof(
    { weight: 3, arbitrary: fc.constantFrom("0", "1", "2", "3", "255") },
    { weight: 2, arbitrary: fc.constantFrom("01", "00", "+1", " 1", "1 ", "1.0", "0x1", "-0", "", "256", "1e1", "\u0661", "a") },
);

const generatedSpecArb: fc.Arbitrary<Record<string, unknown>> = fc
    .record(
        {
            clauseId: fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
            version: fc.integer({ min: 1, max: 9 }),
            title: fc.string({ maxLength: 12 }),
            description: fc.string({ maxLength: 24 }),
            fields: fieldSetArb,
            stages: fc.dictionary(stageKeyArb, fieldSetArb, { maxKeys: 2 }),
        },
        { requiredKeys: ["clauseId", "version", "title", "description", "fields"] },
    )
    // Sometimes malformed: the parse verdict is one of the three answers.
    .chain((spec) =>
        fc.tuple(fc.integer({ min: 0, max: 19 }), stageKeyArb).map(([roll, key]) => {
            const damaged: Record<string, unknown> = { ...spec };
            if (roll === 0) delete damaged.clauseId;
            if (roll === 1) damaged.version = "1";
            if (roll === 2) damaged.fields = {};
            if (roll === 3) damaged.fields = [...(spec.fields as unknown[]), { name: "x", required: true, type: "decimal" }];
            if (roll === 4) damaged.fields = [...(spec.fields as unknown[]), { name: "e", required: true, type: "enum", values: Array.from({ length: 257 }, (_, i) => `v${i}`) }];
            if (roll >= 5 && roll <= 10) {
                // Sets that parse, so the stage key alone decides the verdict.
                damaged.fields = [{ name: "note", type: "string", required: true }];
                damaged.stages = { [key]: [{ name: "reading", type: "integer", required: true }] };
            }
            return damaged;
        }),
    );

// ── The vectors ─────────────────────────────────────────────────────────────

interface Vector {
    type: "vector";
    index: number;
    origin: string;
    spec: unknown;
    specOk: boolean;
    stage: number | null;
    content: unknown;
    validateOk: boolean | null;
    encoded: string | null;
}

function answer(index: number, origin: string, rawSpec: unknown, stage: number | null, content: unknown): Vector {
    const base = { type: "vector" as const, index, origin, spec: rawSpec, stage, content };
    const parsed = parseClauseSpec(rawSpec);
    if (!parsed.ok) return { ...base, specOk: false, validateOk: null, encoded: null };
    const options = stage === null ? {} : { stage };
    const verdict = validateContent(content, parsed.spec, options);
    if (!verdict.ok) return { ...base, specOk: true, validateOk: false, encoded: null };
    // Content Layer A validates, Layer A encodes: a throw here is a defect in
    // Layer A itself, and fails the generator.
    return {
        ...base,
        specOk: true,
        validateOk: true,
        encoded: encodeContentFromSpec(parsed.spec, content as Record<string, unknown>, options),
    };
}

function fieldsOf(rawSpec: unknown, stage: number | null): readonly FieldSpec[] {
    const parsed = parseClauseSpec(rawSpec);
    if (!parsed.ok) return [];
    const spec: ClauseSpec = parsed.spec;
    return stage === null ? spec.fields : contentFieldsFor(spec, { stage });
}

function stagesOf(rawSpec: unknown): (number | null)[] {
    const parsed = parseClauseSpec(rawSpec);
    if (!parsed.ok) return [null];
    return [null, ...Object.keys(parsed.spec.stages ?? {}).map((key) => stageOfKey(key) as number), 9];
}

function build(seed: number, perSpec: number, generatedSpecs: number): Vector[] {
    const protocol = readdirSync(CLAUSES_DIR)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => ({ origin: f, spec: JSON.parse(readFileSync(path.join(CLAUSES_DIR, f), "utf8")) as unknown }));
    const generated = fc
        .sample(generatedSpecArb, { seed, numRuns: generatedSpecs })
        .map((spec, i) => ({ origin: `generated-${i}`, spec: spec as unknown }));

    // One patterned field per spec, so a pattern's verdict is the spec's.
    const patterned = fc
        .sample(patternArb, { seed: seed + 7, numRuns: generatedSpecs * 4 })
        .map((pattern, i) => ({
            origin: `pattern-${i}`,
            spec: {
                clauseId: "p",
                version: 1,
                title: "P",
                description: "D",
                fields: [{ name: "v", type: "string", required: true, pattern }],
            } as unknown,
        }));

    const vectors: Vector[] = [];
    [...protocol, ...generated, ...patterned].forEach(({ origin, spec }, s) => {
        for (const stage of stagesOf(spec)) {
            const fields = fieldsOf(spec, stage);
            const draw = seed + s * 31 + (stage ?? 0);
            const contents = [
                ...fc.sample(contentArb(fields, true), { seed: draw, numRuns: perSpec }),
                ...fc.sample(contentArb(fields, false), { seed: draw, numRuns: perSpec }),
            ];
            for (const content of contents) {
                vectors.push(answer(vectors.length, origin, spec, stage, content));
            }
        }
    });

    // A list of values under one large pattern, at both edges of the
    // content's total: the most values it runs on, and one value more, which
    // both engines refuse. Only for a pattern of expanded size 256 or more,
    // so a content stays under 65,537 characters.
    // Most draws are a counted range that matches the values, so the total
    // alone decides the verdict at its edge; the rest are large patterns of
    // any shape.
    const rangeArb = fc
        .tuple(fc.integer({ min: 4, max: 31 }), fc.integer({ min: 4, max: 64 }), fc.boolean())
        .map(([k, m, anchored]) => (anchored ? `^(?:[ab]{0,${k}}){${m}}$` : `(?:[ab]{0,${k}}){${m}}`));
    const totals = fc.sample(
        fc.tuple(
            fc.oneof({ weight: 3, arbitrary: rangeArb }, { weight: 1, arbitrary: patternArb }),
            fc.constantFrom(1, 16, 64, 255),
            fc.constantFrom("a", "b", "c"),
            fc.constantFrom(0, 1),
        ),
        { seed: seed + 13, numRuns: generatedSpecs * 2 },
    );
    totals.forEach(([pattern, length, unit, over], i) => {
        const size = portablePatternSize(pattern);
        if (size === null || size < 256 || length * size > MAX_PATTERN_WORK) return;
        const spec = {
            clauseId: "p",
            version: 1,
            title: "P",
            description: "D",
            fields: [{ name: "v", type: "array", required: true, items: { type: "string", pattern } }],
        };
        const count = Math.floor(MAX_CONTENT_PATTERN_WORK / (length * size)) + over;
        const content = { v: Array.from({ length: count }, () => unit.repeat(length)) };
        vectors.push(answer(vectors.length, `pattern-total-${i}`, spec, null, content));
    });
    return vectors;
}

describe("Clause fuzz vectors — the generated leg of the clause-engine lock", () => {
    if (process.env.CLAUSE_FUZZ_SEED !== undefined) {
        it("writes generated vectors to test/fixtures/streams/clauses.jsonl", () => {
            const seed = Number(process.env.CLAUSE_FUZZ_SEED);
            expect(Number.isSafeInteger(seed), "CLAUSE_FUZZ_SEED is an integer").toBe(true);
            const vectors = build(seed, Number(process.env.CLAUSE_FUZZ_PER_SPEC ?? "8"), 40);
            const valid = vectors.filter((v) => v.validateOk === true).length;
            const invalid = vectors.filter((v) => v.validateOk === false).length;
            const unparsed = vectors.filter((v) => !v.specOk).length;
            expect(valid, "the vectors hold content Layer A accepts").toBeGreaterThan(0);
            expect(invalid, "the vectors hold content Layer A rejects").toBeGreaterThan(0);
            expect(unparsed, "the vectors hold specs Layer A refuses").toBeGreaterThan(0);
            mkdirSync(path.dirname(OUT_PATH), { recursive: true });
            const header = { type: "header", seed, count: vectors.length, valid, invalid, unparsed };
            writeFileSync(OUT_PATH, `${[header, ...vectors].map((v) => JSON.stringify(v)).join("\n")}\n`);
        });
        return;
    }

    it("the same seed yields the same vectors", () => {
        const a = build(1, 3, 6);
        const b = build(1, 3, 6);
        expect(a.length).toBeGreaterThan(0);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it("the stream reaches the grain cap, the private set's rules and a valid private set", () => {
        // Both engines apply these rules, so the stream holds cases of each:
        // content the cap alone refuses, specs the private set's rules alone
        // refuse, and a private set whose content both engines encode.
        let capRefusals = 0;
        let privateSetRefusals = 0;
        let privateSetsEncoded = 0;
        for (const seed of [1, 2, 3]) {
            for (const v of build(seed, 8, 40)) {
                const parsed = parseClauseSpec(v.spec);
                if (!parsed.ok) {
                    if (parsed.errors.every((e) => PRIVATE_SET_REFUSAL.test(e.message))) privateSetRefusals += 1;
                    continue;
                }
                if (v.validateOk === true && JSON.stringify(v.spec).includes('"blinding":true')) privateSetsEncoded += 1;
                if (v.validateOk !== false) continue;
                const verdict = validateContent(v.content, parsed.spec, v.stage === null ? {} : { stage: v.stage });
                if (!verdict.ok && verdict.errors.every((e) => GRAIN_REFUSAL.test(e.message))) capRefusals += 1;
            }
        }
        expect(capRefusals, "content the grain cap alone refuses").toBeGreaterThan(0);
        expect(privateSetRefusals, "specs the private set's rules alone refuse").toBeGreaterThan(0);
        expect(privateSetsEncoded, "private sets whose content validates").toBeGreaterThan(0);
    });
});
