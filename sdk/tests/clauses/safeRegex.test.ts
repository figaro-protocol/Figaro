import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    safeRegexTest,
    isPortablePattern,
    isRunnablePattern,
    portablePatternMatches,
    portablePatternSize,
    patternWorkExceeded,
    MAX_PATTERN_EXPANSION,
    MAX_PATTERN_WORK,
    MAX_CONTENT_PATTERN_WORK,
} from "../../src/clauses/safeRegex.js";
import { parseClauseSpec, validateContent } from "../../src/clauses/index.js";

/**
 * A clause's `pattern` is untrusted: anyone registers a spec. The SDK matches
 * it with its own automaton, in time linear in the value. A pattern past its
 * size limit does not parse, and a value past the work budget is refused;
 * every other value is run, as the guest does, so the two engines give one
 * verdict.
 */
describe("safeRegexTest — linear-time pattern matching", () => {
    it("matches overlapping alternation in linear time (^(a|a)*$ on 40 a's and !)", () => {
        const pattern = "^(a|a)*$";
        expect(isPortablePattern(pattern)).toBe(true);
        const start = performance.now();
        const verdict = safeRegexTest(pattern, "a".repeat(40) + "!");
        const elapsed = performance.now() - start;
        expect(verdict).toBe(false);
        expect(elapsed).toBeLessThan(250);
        expect(safeRegexTest(pattern, "a".repeat(40))).toBe(true);
    });

    it("validates a spec carrying ^(a|a)*$ in linear time, on a long value too", () => {
        const parsed = parseClauseSpec({
            clauseId: "x",
            version: 1,
            title: "t",
            description: "d",
            fields: [{ name: "s", type: "string", required: true, pattern: "^(a|a)*$" }],
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const start = performance.now();
        const verdict = validateContent({ s: "a".repeat(100_000) + "!" }, parsed.spec);
        expect(performance.now() - start).toBeLessThan(1000);
        if (!verdict.ok) expect(verdict.errors.map((e) => e.message)).toEqual(["string does not match pattern ^(a|a)*$"]);
        expect(verdict.ok).toBe(false);
    });

    it("does not run the pattern of a value over maxLength", () => {
        const parsed = parseClauseSpec({
            clauseId: "x",
            version: 1,
            title: "t",
            description: "d",
            fields: [{ name: "s", type: "string", required: true, maxLength: 8, pattern: "^(a|a)*$" }],
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const verdict = validateContent({ s: "a".repeat(40) + "!" }, parsed.spec);
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.errors.map((e) => e.message)).toEqual(["string longer than maxLength 8"]);
    });

    it("still enforces a non-matching pattern", () => {
        expect(safeRegexTest("^[0-9]+$", "12345")).toBe(true);
        expect(safeRegexTest("^[0-9]+$", "12a45")).toBe(false);
    });

    it("refuses every value under a pattern it cannot run (no parsed spec carries one)", () => {
        expect(portablePatternMatches("(unclosed", "anything")).toBeNull();
        expect(isRunnablePattern("(unclosed")).toBe(false);
        expect(isRunnablePattern("^(?=a).*$")).toBe(false);
        expect(isRunnablePattern("^a+$")).toBe(true);
        expect(safeRegexTest("(unclosed", "anything")).toBe(false);
        expect(safeRegexTest("^(?=a).*$", "b")).toBe(false);
        expect(safeRegexTest("^(?=a).*$", "a")).toBe(false);
    });

    it("refuses, with its own reason, a value under a pattern a spec built in code carries outside the core", () => {
        // `parseClauseSpec` refuses such a spec; one built by hand reaches
        // the validator, which counts no value as matching unchecked.
        const spec = {
            clauseId: "x",
            version: 1,
            title: "t",
            description: "d",
            fields: [{ name: "s", type: "string" as const, required: true, pattern: "^(?=a).*$" }],
        };
        const verdict = validateContent({ s: "abc" }, spec);
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) expect(verdict.errors.map((e) => e.message)).toEqual(["pattern ^(?=a).*$ cannot be run"]);
        const parsed = parseClauseSpec(spec);
        expect(parsed.ok).toBe(false);
    });

    it("tests a value longer than 4,096 characters against its pattern, in a field with no maxLength", () => {
        const parsed = parseClauseSpec({
            clauseId: "x",
            version: 1,
            title: "t",
            description: "d",
            fields: [{ name: "s", type: "string", required: true, pattern: "^a+$" }],
        });
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(validateContent({ s: "a".repeat(5000) }, parsed.spec).ok).toBe(true);
        expect(validateContent({ s: "a".repeat(4999) + "b" }, parsed.spec).ok).toBe(false);
        expect(safeRegexTest("^y+$", "x".repeat(5000))).toBe(false);
    });

    it("runs a pattern whose quantified group holds a quantifier, and refuses a value it does not match", () => {
        const domain = "^([a-z0-9-]+\\.)+[a-z]{2,}$";
        expect(isPortablePattern(domain)).toBe(true);
        expect(safeRegexTest(domain, "example.com")).toBe(true);
        expect(safeRegexTest(domain, "a.b-c.example.org")).toBe(true);
        expect(safeRegexTest(domain, "example")).toBe(false);
        expect(safeRegexTest(domain, "Example.com")).toBe(false);
        expect(safeRegexTest(domain, "example.c")).toBe(false);

        // Built at run time, as below: a constant regex source of this shape
        // would read as the defect itself.
        const nested = ["(a+)", "+$"].join("");
        const start = performance.now();
        expect(safeRegexTest(nested, "a".repeat(46) + "!")).toBe(false);
        expect(safeRegexTest(nested, "b")).toBe(false);
        expect(safeRegexTest(nested, "aaa")).toBe(true);
        expect(performance.now() - start).toBeLessThan(250);
    });

    it("matches ^(a|a)*$ against a long value that does not match, in linear time", () => {
        const pattern = ["^(a", "|a)*$"].join("");
        const start = performance.now();
        expect(safeRegexTest(pattern, "a".repeat(100_000) + "!")).toBe(false);
        expect(performance.now() - start).toBeLessThan(1000);
    });

    it("compiles a pattern of empty branches without blowing up", () => {
        const pattern = `^${"(?:".repeat(2)}${"|".repeat(30)}${"){8}".repeat(2)}a$`;
        expect(isPortablePattern(pattern)).toBe(true);
        const start = performance.now();
        expect(portablePatternMatches(pattern, "a")).toBe(true);
        expect(portablePatternMatches(pattern, "b")).toBe(false);
        expect(performance.now() - start).toBeLessThan(250);
    });
});

describe("the expanded size — one measure in both engines", () => {
    it("counts each atom, assertion and `|` one, a group and `*`, `+`, `?` one more, a count its item plus one times the count", () => {
        const cases: [string, number][] = [
            ["a", 1],
            ["\\b", 1],
            ["ab", 2],
            ["a|b", 3],
            ["(a)", 2],
            ["(?:a)", 2],
            ["a*", 2],
            ["a+?", 2],
            ["a?", 2],
            ["(?:a*)*", 4],
            ["a{3}", 6],
            ["a{2,5}", 10],
            ["a{2,}", 6],
            ["a{0}", 0],
            ["(?:a{31}){64}", 4096],
        ];
        for (const [p, size] of cases) expect(portablePatternSize(p), p).toBe(size);
    });

    it("gives the reference patterns small sizes", () => {
        const cases: [string, number][] = [
            ["^([a-z0-9-]+\\.)+[a-z]{2,}$", 13],
            ["^0x[0-9a-fA-F]{40}$", 84],
            ["^0x[0-9a-fA-F]{64}$", 132],
            ["^UN[0-9]{4}$", 12],
            ["^[A-Za-z0-9][A-Za-z0-9 ./-]{0,63}$", 129],
            ["^[A-Za-z][A-Za-z0-9-]{1,15}$", 33],
            ["^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$", 19],
            ["^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$", 69],
        ];
        for (const [p, size] of cases) expect(portablePatternSize(p), p).toBe(size);
    });

    it("counts a wide class one, at the size limit and past it", () => {
        // A class of every other printable character, negated: 49 byte
        // ranges, the most a portable class holds.
        const wide = String.raw`[^!#%')+\-/13579;=?ACEGIKMOQSUWY\[\]_acegikmoqsuwy{}]`;
        expect(portablePatternSize(wide)).toBe(1);
        expect(portablePatternSize(`(?:${wide}{0,63}){32}`)).toBe(4096);
        expect(isRunnablePattern(`(?:${wide}{0,63}){32}`)).toBe(true);
        expect(isPortablePattern(`(?:${wide}{0,63}){32}a`)).toBe(false);
    });

    it("refuses a pattern past MAX_PATTERN_EXPANSION, nested quantifiers included", () => {
        expect(MAX_PATTERN_EXPANSION).toBe(4096);
        expect(portablePatternSize("(?:a{31}){64}")).toBe(4096);
        expect(isPortablePattern("(?:a{31}){64}a")).toBe(false);
        expect(isPortablePattern("(?:a{64}){64}")).toBe(false);
        const deep = (k: number, q: string) => "(?:".repeat(k) + "a" + `)${q}`.repeat(k);
        // Each level of `(?:…)*` counts two, so nesting no longer hides cost.
        expect(portablePatternSize(deep(20, "*"))).toBe(41);
        expect(isPortablePattern(`^(?:(?:${deep(20, "*")}){64}){63}$`)).toBe(false);
        expect(isPortablePattern(`^(?:(?:${deep(20, "*")}){8}){11}$`)).toBe(true);
    });
});

describe("the work budget — a long value is refused, never counted as matching", () => {
    it("runs a value at MAX_PATTERN_WORK and refuses one character more", () => {
        expect(MAX_PATTERN_WORK).toBe(1 << 22);
        // Size 4,096, and it matches every value: only the budget refuses.
        const big = "(?:a{0,31}){64}";
        expect(portablePatternSize(big)).toBe(4096);
        expect(patternWorkExceeded(big, "a".repeat(1024))).toBe(false);
        expect(safeRegexTest(big, "a".repeat(1024))).toBe(true);
        expect(patternWorkExceeded(big, "a".repeat(1025))).toBe(true);
        expect(safeRegexTest(big, "a".repeat(1025))).toBe(false);
        // `^a+$` has size 4: a value of 1,048,576 characters runs.
        expect(safeRegexTest("^a+$", "a".repeat(1 << 20))).toBe(true);
        expect(safeRegexTest("^a+$", "a".repeat((1 << 20) + 1))).toBe(false);
    });

    it("gives the refusal its own reason, and keeps the maxLength reason first", () => {
        const spec = (extra: Record<string, unknown>) => {
            const parsed = parseClauseSpec({
                clauseId: "x",
                version: 1,
                title: "t",
                description: "d",
                fields: [{ name: "s", type: "string", required: true, pattern: "(?:a{31}){64}", ...extra }],
            });
            if (!parsed.ok) throw new Error("spec");
            return parsed.spec;
        };
        const over = validateContent({ s: "a".repeat(1025) }, spec({}));
        expect(over.ok).toBe(false);
        if (!over.ok) expect(over.errors.map((e) => e.message)).toEqual(["string too long for pattern (?:a{31}){64}"]);
        const capped = validateContent({ s: "a".repeat(1025) }, spec({ maxLength: 1024 }));
        expect(capped.ok).toBe(false);
        if (!capped.ok) expect(capped.errors.map((e) => e.message)).toEqual(["string longer than maxLength 1024"]);
    });

    // The costliest patterns found at the size limit, each on the longest
    // value the budget lets it run on. The guest's leg is
    // `prover/clause/tests/conformance.rs`.
    it("matches the costliest patterns at the budget's edge in bounded time", () => {
        const patterns = [
            "^(?:(?:(?:(?:a)*)*){64}){9}$",
            "^(?:(?:a*|b*){24}){24}$",
            "^(?:a{0,64}){31}$",
            "^(?:(?:a{0,8}){8}){28}$",
            "^(?:(?:(a)+){28}){28}$",
            String.raw`^(?:[^!#%')+\-/13579;=?ACEGIKMOQSUWY\[\]_acegikmoqsuwy{}]{0,64}){31}$`,
            "^(?:[!#%')+/13579;=?ACEGIKMOQSUWY_acegikmoqsuwy{}]{0,64}){31}$",
            "b",
        ];
        for (const p of patterns) {
            const size = portablePatternSize(p);
            expect(size, p).not.toBeNull();
            // `~` is in no class above but the negated one, whose `a` fails first.
            const value = "a".repeat(Math.floor(MAX_PATTERN_WORK / (size as number)) - 1) + "~";
            const start = performance.now();
            expect(safeRegexTest(p, value), p).toBe(false);
            expect(performance.now() - start, p).toBeLessThan(5000);
        }
    }, 60_000);
});

describe("the content's total — one content's pattern work is bounded too", () => {
    const listSpec = (pattern: string, extra: Record<string, unknown> = {}) => {
        const parsed = parseClauseSpec({
            clauseId: "x",
            version: 1,
            title: "t",
            description: "d",
            fields: [{ name: "v", type: "array", required: true, items: { type: "string", pattern, ...extra } }],
        });
        if (!parsed.ok) throw new Error("spec");
        return parsed.spec;
    };
    const messages = (r: ReturnType<typeof validateContent>) => (r.ok ? [] : r.errors.map((e) => `${e.path} ${e.message}`));

    it("admits 1,925 32-byte hashes and refuses 1,926, once, at $", () => {
        expect(MAX_CONTENT_PATTERN_WORK).toBe(1 << 24);
        const spec = listSpec("^0x[0-9a-fA-F]{64}$");
        const hash = `0x${"ab".repeat(32)}`;
        expect(validateContent({ v: Array.from({ length: 1925 }, () => hash) }, spec).ok).toBe(true);
        const over = validateContent({ v: Array.from({ length: 1926 }, () => hash) }, spec);
        expect(messages(over)).toEqual(["$ content too long for its patterns"]);
    });

    it("refuses the many-values shape fast, after the values the total admits", () => {
        const spec = listSpec("^(?:a{0,64}){31}$");
        const start = performance.now();
        const over = validateContent({ v: Array.from({ length: 1000 }, () => "a".repeat(1039) + "!") }, spec);
        expect(performance.now() - start).toBeLessThan(5000);
        expect(messages(over)).toEqual([
            ...Array.from({ length: 4 }, (_, i) => `$.v[${i}] string does not match pattern ^(?:a{0,64}){31}$`),
            "$ content too long for its patterns",
        ]);
    });

    it("adds nothing for a value refused for its maxLength or its own budget", () => {
        const capped = listSpec("^(?:a{0,64}){31}$", { maxLength: 1039 });
        const r = validateContent({ v: Array.from({ length: 20 }, () => "a".repeat(1040)) }, capped);
        expect(messages(r).every((m) => m.endsWith("string longer than maxLength 1039"))).toBe(true);
        const budget = listSpec("^(?:a{0,64}){31}$");
        const r2 = validateContent({ v: Array.from({ length: 20 }, () => "a".repeat(1041)) }, budget);
        expect(messages(r2).every((m) => m.endsWith("string too long for pattern ^(?:a{0,64}){31}$"))).toBe(true);
    });
});

/** Every `pattern` a protocol clause in `clauses/` declares, at any depth. */
function protocolPatterns(): string[] {
    const dir = path.resolve(__dirname, "../../../clauses");
    const found = new Set<string>();
    const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v !== null && typeof v === "object") {
            for (const [k, x] of Object.entries(v)) {
                if (k === "pattern" && typeof x === "string") found.add(x);
                else walk(x);
            }
        }
    };
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
        walk(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
    }
    return [...found];
}

/** Portable patterns that exercise each construct the core admits. */
const CONSTRUCT_PATTERNS = [
    // Built at run time: the overlapping alternation is the case the matcher
    // exists for, and a constant regex source would read as the defect itself.
    ["^(a", "|a)*$"].join(""),
    "^(a|ab)*c$",
    "a|b|",
    "^(?:a|b)c$",
    "^(a|)c$",
    "^()$",
    "()*a",
    "\\bab\\b",
    "a\\B.",
    "^\\d{2,3}\\D?$",
    "[^a-c]+\\w*\\W",
    "\\s\\S{0,2}$",
    "^[-a]+[a-]?$",
    "^[\\d\\-x]{1,}$",
    "a{0}b",
    "a{2,}?b",
    "^a*?b+?c??$",
    "^.{3}$",
    "^a^",
    "$a",
    "^\\.\\*\\+\\?\\(\\)\\|\\[\\]\\{\\}\\^\\$\\-\\/#&~,:;=!@%\"'`$",
];

describe("portablePatternMatches agrees with JavaScript's RegExp", () => {
    const patterns = [...protocolPatterns(), ...CONSTRUCT_PATTERNS];

    it("reads every protocol clause pattern and each construct as portable", () => {
        expect(protocolPatterns().length).toBeGreaterThan(0);
        for (const p of patterns) expect(isPortablePattern(p), p).toBe(true);
    });

    it("on random short printable-ASCII values", () => {
        const alphabet = [..." -./0123456789:;ABCDNUZ_abcxyz!\"#$%&'()*+,=?@[\\]^`{|}~"];
        const value = fc.oneof(
            fc.string({ unit: fc.constantFrom(...alphabet), maxLength: 12 }),
            fc.string({ unit: fc.constantFrom("a", "b", "c", "!"), maxLength: 12 }),
        );
        fc.assert(
            fc.property(fc.constantFrom(...patterns), value, (pattern, v) => {
                expect(portablePatternMatches(pattern, v), `${pattern} on ${JSON.stringify(v)}`).toBe(new RegExp(pattern).test(v));
            }),
            { numRuns: 20000, seed: 1 },
        );
    });

    it("on values drawn to match each pattern", () => {
        let drawn = 0;
        for (const pattern of patterns) {
            // fast-check's generator reads no empty branch (`a|`, `()`): those
            // patterns are covered by the random values above.
            let matching: fc.Arbitrary<string>;
            try {
                matching = fc.stringMatching(new RegExp(pattern));
            } catch {
                continue;
            }
            drawn++;
            fc.assert(
                fc.property(matching, (v) => {
                    if (![...v].every((c) => c >= " " && c <= "~")) return;
                    expect(portablePatternMatches(pattern, v), `${pattern} on ${JSON.stringify(v)}`).toBe(new RegExp(pattern).test(v));
                }),
                { numRuns: 200, seed: 2 },
            );
        }
        expect(drawn).toBeGreaterThan(protocolPatterns().length);
    });
});
