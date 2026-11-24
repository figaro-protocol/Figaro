import { describe, expect, it } from "vitest";
import { parseClauseSpec } from "../../src/clauses/spec.js";

describe("parseClauseSpec — meta-clause validation", () => {
    it("accepts a minimal valid spec", () => {
        const result = parseClauseSpec({
            clauseId: "test",
            version: 1,
            title: "Test",
            description: "A minimal test spec.",
            fields: [
                { name: "x", type: "string", required: true },
            ],
        });
        expect(result.ok).toBe(true);
    });

    it("rejects a non-object input", () => {
        const result = parseClauseSpec("not an object");
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$");
    });

    it("rejects missing clauseId", () => {
        const result = parseClauseSpec({
            version: 1, title: "T", description: "D", fields: [],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors.some(e => e.path === "$.clauseId")).toBe(true);
    });

    it("rejects unknown field type", () => {
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "wat", required: true }],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].path).toBe("$.fields[0].type");
    });

    it("accepts any string as a format — the axis is OPEN (a closed set would make a third-party clause with a novel format unparseable)", () => {
        const known = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "addr", type: "string", required: true, format: "address-hex" }],
        });
        expect(known.ok).toBe(true);

        const novel = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "loc", type: "string", required: true, format: "geohash" }],
        });
        expect(novel.ok).toBe(true);

        // Only the SHAPE of the declaration is checked.
        const malformed = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, format: 7 }],
        });
        expect(malformed.ok).toBe(false);
        const empty = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, format: "" }],
        });
        expect(empty.ok).toBe(false);
    });

    it("parses a field disposition and rejects an unknown one", () => {
        const priv = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "coords", type: "string", required: true, disposition: "private" }, BLINDING],
        });
        expect(priv.ok).toBe(true);
        if (priv.ok) expect(priv.spec.fields[0].disposition).toBe("private");

        // Absent ⇒ carried as undefined; consumers default it to "public".
        const bare = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "loc", type: "string", required: true }],
        });
        expect(bare.ok).toBe(true);
        if (bare.ok) expect(bare.spec.fields[0].disposition).toBeUndefined();

        const bad = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, disposition: "secret" }],
        });
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.errors[0].path).toBe("$.fields[0].disposition");
    });

    it("parses formatFromField (value-driven input format) and rejects a non-string", () => {
        const ok = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "origin", type: "string", required: true, formatFromField: "geocodeStandard" }],
        });
        expect(ok.ok).toBe(true);
        if (ok.ok) {
            const f = ok.spec.fields[0];
            expect(f.type === "string" && f.formatFromField).toBe("geocodeStandard");
        }

        const bad = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, formatFromField: "" }],
        });
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.errors[0].path).toBe("$.fields[0].formatFromField");
    });

    it("recursively parses array.items", () => {
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{
                name: "tags", type: "array", required: true,
                items: { type: "string", name: "*", required: true },
            }],
        });
        expect(result.ok).toBe(true);
    });

    it("recursively parses object.fields", () => {
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{
                name: "loc", type: "object", required: true,
                fields: [
                    { name: "lat", type: "integer", required: true },
                    { name: "lon", type: "integer", required: true },
                ],
            }],
        });
        expect(result.ok).toBe(true);
    });

    it("validates enum requires non-empty values array", () => {
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "enum", required: true, values: [] }],
        });
        expect(result.ok).toBe(false);
    });

    it("rejects an enum past the uint8 encode ceiling AT PARSE TIME — never after first-write-wins registration", () => {
        const values = Array.from({ length: 257 }, (_, i) => `v${i}`);
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "enum", required: true, values }],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0].message).toMatch(/256/);
        // Exactly 256 still parses — the full uint8 range is legitimate.
        const atCap = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "enum", required: true, values: values.slice(0, 256) }],
        });
        expect(atCap.ok).toBe(true);
    });

    it("parses stage overrides", () => {
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true }],
            stages: {
                1: [{ name: "x", type: "string", required: true },
                    { name: "extra", type: "boolean", required: false }],
            },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.spec.stages?.[1].length).toBe(2);
    });

    it("rejects bigint min/max as a number (must be string)", () => {
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "amount", type: "bigint", required: true, min: 0 }],
        });
        expect(result.ok).toBe(false);
    });

    it("rejects invalid regex pattern", () => {
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true, pattern: "(unclosed" }],
        });
        expect(result.ok).toBe(false);
    });

    // NOTE: the `block` slice (designer/runtime composition metadata) is
    // frontend-owned presentation, not part of the SDK's spec surface —
    // parseClauseSpec ignores it. Its parser (`parseBlockBinding`) and tests
    // live in the frontend: frontend/lib/shared/clauseBlockBinding.ts +
    // frontend/tests/lib/clauseBlockBinding.test.ts.
    it("ignores the block slice (frontend-owned) without failing", () => {
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "x", type: "string", required: true }],
            block: { design: { article: "logistics", nestsUnder: null, fills: [], composes: null } },
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect("block" in result.spec).toBe(false);
    });

    // The generic build encoder fills absent optional input from FieldSpec
    // `default` — round-trip it and reject shape mismatches.
    it("preserves a type-matching field default through the parse", () => {
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [
                { name: "scope", type: "integer", min: 1, max: 3, required: false, default: 1 },
                { name: "coordination", type: "array", required: false, default: ["a"], items: { type: "enum", values: ["a", "b"] } },
            ],
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.spec.fields[0].default).toBe(1);
            expect(result.spec.fields[1].default).toEqual(["a"]);
        }
    });

    it("rejects a default that violates the field's type or constraints", () => {
        for (const field of [
            { name: "scope", type: "integer", min: 1, required: false, default: 0 },
            { name: "court", type: "enum", values: ["a", "b"], required: false, default: "c" },
            { name: "obj", type: "object", fields: [], required: false, default: "x" },
        ]) {
            const result = parseClauseSpec({
                clauseId: "t", version: 1, title: "T", description: "D", fields: [field],
            });
            expect(result.ok, `default on ${field.name} must be rejected`).toBe(false);
        }
    });

    // Enum `sentinel` names the ABI position-as-index placeholder — a member
    // value that is never valid input. The spec here is a test spec: no
    // reference clause declares a sentinel, and every klerosCourt value
    // (`general` among them) names a real Kleros court.
    it("preserves an enum sentinel and rejects a non-member sentinel", () => {
        const ok = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "court", type: "enum", values: ["none", "a"], sentinel: "none", required: true }],
        });
        expect(ok.ok).toBe(true);
        if (ok.ok) {
            const f = ok.spec.fields[0];
            expect(f.type === "enum" && f.sentinel).toBe("none");
        }

        const bad = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "court", type: "enum", values: ["a"], sentinel: "zzz", required: true }],
        });
        expect(bad.ok).toBe(false);
    });

    it("rejects a default equal to the enum sentinel", () => {
        const result = parseClauseSpec({
            clauseId: "t", version: 1, title: "T", description: "D",
            fields: [{ name: "court", type: "enum", values: ["none", "a"], sentinel: "none", default: "none", required: false }],
        });
        expect(result.ok).toBe(false);
    });

    it("rejects an adversarially deep-nested field spec instead of overflowing the stack", () => {
        // A permissionlessly-registered spec nested thousands deep must parse-reject
        // (bounded), never RangeError. Build ~5000-deep object.fields.
        let leaf: Record<string, unknown> = { name: "leaf", type: "string", required: true };
        for (let i = 0; i < 5000; i++) {
            leaf = { name: `n${i}`, type: "object", required: true, fields: [leaf] };
        }
        const result = parseClauseSpec({
            clauseId: "deep", version: 1, title: "Deep", description: "Adversarial nesting.",
            fields: [leaf],
        });
        expect(result.ok).toBe(false);
    });

    it("rejects a clause that mixes public and private field dispositions", () => {
        const result = parseClauseSpec({
            clauseId: "figaro-mixed", version: 1, title: "M", description: "D",
            fields: [
                { name: "open", required: false, type: "string", disposition: "public" },
                { name: "secret", required: false, type: "string", disposition: "private" },
            ],
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.path === "$.fields" && /mix public and private/.test(e.message))).toBe(true);
        }
    });

    it("accepts an all-private clause (homogeneous disposition)", () => {
        const result = parseClauseSpec({
            clauseId: "figaro-private-only", version: 1, title: "P", description: "D",
            fields: [{ name: "secret", required: false, type: "string", disposition: "private" }, BLINDING],
        });
        expect(result.ok).toBe(true);
    });

});

/** The blinding field a private set declares: the shape rule R1 names. */
const BLINDING = {
    name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true,
} as const;

const SECRET = { name: "secret", type: "string", required: true, disposition: "private" } as const;
const OPEN = { name: "open", type: "string", required: true } as const;

const specWith = (fields: unknown[], stages?: Record<string, unknown[]>) => ({
    clauseId: "t", version: 1, title: "T", description: "D", fields,
    ...(stages !== undefined && { stages }),
});

const refusedAt = (raw: unknown, path: string, message: RegExp): void => {
    const result = parseClauseSpec(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
        expect(
            result.errors.some((e) => e.path === path && message.test(e.message)),
            JSON.stringify(result.errors),
        ).toBe(true);
    }
};

describe("parseClauseSpec — the blinding field of a private set", () => {
    it("parses a private set that declares exactly one blinding field, and keeps the attribute", () => {
        const result = parseClauseSpec(specWith([SECRET, BLINDING]));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.spec.fields.find((f) => f.name === "blinding")?.blinding).toBe(true);
            expect(result.spec.fields.find((f) => f.name === "secret")?.blinding).toBeUndefined();
        }
    });

    it("refuses a private set that declares no blinding field", () => {
        refusedAt(specWith([SECRET]), "$.fields", /exactly one blinding field/);
    });

    it("refuses a private set that declares two blinding fields", () => {
        refusedAt(specWith([SECRET, BLINDING, { ...BLINDING, name: "blinding2" }]), "$.fields", /exactly one blinding field/);
    });

    it("refuses a blinding field in a set that declares no other private field", () => {
        refusedAt(specWith([BLINDING]), "$.fields", /no private field/);
        refusedAt(specWith([OPEN, BLINDING]), "$.fields", /no private field/);
    });

    it("refuses a blinding field with a default, not required, or of another type, format or disposition", () => {
        const cases: [Record<string, unknown>, string][] = [
            [{ ...BLINDING, default: `0x${"11".repeat(32)}` }, "default"],
            [{ ...BLINDING, required: false }, "required"],
            [{ name: "blinding", type: "bigint", required: true, disposition: "private", blinding: true }, "type"],
            [{ ...BLINDING, format: "bytes-hex" }, "format"],
            [{ name: "blinding", type: "string", required: true, disposition: "private", blinding: true }, "format"],
            [{ ...BLINDING, disposition: "public" }, "disposition"],
        ];
        for (const [field, key] of cases) {
            refusedAt(specWith([SECRET, field]), `$.fields[1].${key}`, /blinding field/);
        }
    });

    it("refuses a blinding attribute that is not true", () => {
        refusedAt(specWith([SECRET, BLINDING, { ...OPEN, name: "x", disposition: "private", blinding: false }]), "$.fields[2].blinding", /true/);
        refusedAt(specWith([SECRET, { ...BLINDING, blinding: "yes" }]), "$.fields[1].blinding", /true/);
    });

    it("refuses a blinding field nested below the top level of its set", () => {
        const nested = { name: "inner", type: "object", required: true, disposition: "private", fields: [BLINDING] };
        refusedAt(specWith([SECRET, BLINDING, nested]), "$.fields[2].fields[0].blinding", /top-level field/);
        const item = { name: "list", type: "array", required: true, disposition: "private", items: { ...BLINDING } };
        refusedAt(specWith([SECRET, BLINDING, item]), "$.fields[2].items.blinding", /top-level field/);
    });

    it("refuses a private stage set that declares no blinding field, and parses one that declares it", () => {
        refusedAt(specWith([OPEN], { "1": [SECRET] }), "$.stages.1", /exactly one blinding field/);
        const ok = parseClauseSpec(specWith([OPEN], { "1": [SECRET, BLINDING] }));
        expect(ok.ok).toBe(true);
        if (ok.ok) expect(ok.spec.stages?.[1]?.some((f) => f.blinding === true)).toBe(true);
    });

    it("refuses a stage set that mixes public and private fields, as it refuses the top-level set", () => {
        refusedAt(specWith([OPEN], { "2": [OPEN, SECRET, BLINDING] }), "$.stages.2", /mix public and private/);
    });

    it("refuses a blinding field in a public stage set", () => {
        refusedAt(specWith([OPEN], { "1": [BLINDING] }), "$.stages.1", /no private field/);
    });

    it("parses a public spec unchanged: no field gains a blinding attribute", () => {
        const raw = specWith([OPEN, { name: "n", type: "integer", required: false }], { "1": [OPEN] });
        const result = parseClauseSpec(raw);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.spec.fields).toEqual(raw.fields);
            expect(result.spec.stages?.[1]).toEqual([OPEN]);
        }
    });
});

// A strict JSON reader in another language (Rust's serde_json, for one)
// refuses a lone UTF-16 surrogate; JSON.parse keeps one, and `canonicalize`
// writes it back into the bytes the clause key hashes. The SDK refuses such
// a spec at parse, so no clause it reads is one such a reader cannot read.
describe("parseClauseSpec — a lone UTF-16 surrogate in the spec's own JSON", () => {
    const text = (title: string, description: string, label: string) =>
        `{"clauseId":"t","version":1,"title":"${title}","description":"${description}",`
        + `"fields":[{"name":"x","type":"string","required":true,"label":"${label}"}]}`;

    it("refuses one in the title, the description or a field's label, as JSON.parse reads it", () => {
        for (const [raw, path] of [
            [text("\\ud800", "D", "L"), "$.title"],
            [text("T", "a\\udfffb", "L"), "$.description"],
            [text("T", "D", "\\udc00\\ud800"), "$.fields[0].label"],
            [text("T", "D", "\\ud83d"), "$.fields[0].label"],
        ] as const) {
            const result = parseClauseSpec(JSON.parse(raw));
            expect(result.ok, raw).toBe(false);
            if (!result.ok) expect(result.errors).toEqual([{ path, message: "string holds a lone UTF-16 surrogate" }]);
        }
    });

    it("refuses one in an unknown attribute and in a key, since both enter the clause key", () => {
        const unknown = parseClauseSpec(JSON.parse('{"clauseId":"t","version":1,"title":"T","description":"D","fields":[],"x-note":["\\ud800"]}'));
        expect(unknown.ok).toBe(false);
        if (!unknown.ok) expect(unknown.errors).toEqual([{ path: "$.x-note[0]", message: "string holds a lone UTF-16 surrogate" }]);
        const key = parseClauseSpec(JSON.parse('{"clauseId":"t","version":1,"title":"T","description":"D","fields":[],"x-note":{"\\ud800":1}}'));
        expect(key.ok).toBe(false);
        if (!key.ok) expect(key.errors).toEqual([{ path: "$.x-note", message: "a key holds a lone UTF-16 surrogate" }]);
    });

    it("accepts a surrogate pair, and leaves `block`, which no key or witness carries, to its own reader", () => {
        expect(parseClauseSpec(JSON.parse(text("\\ud83d\\ude9a", "🚚", "L"))).ok).toBe(true);
        const withBlock = JSON.parse('{"clauseId":"t","version":1,"title":"T","description":"D","fields":[],"block":{"design":{"note":"\\ud800"}}}');
        expect(parseClauseSpec(withBlock).ok).toBe(true);
    });
});
