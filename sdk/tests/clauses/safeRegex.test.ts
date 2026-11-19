import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    safeRegexTest,
    isPotentiallyCatastrophicRegex,
    isPortablePattern,
    portablePatternMatches,
    MAX_PATTERN_TEST_INPUT,
} from "../../src/clauses/safeRegex.js";
import { parseClauseSpec, validateContent } from "../../src/clauses/index.js";

/**
 * A clause's `pattern` is untrusted: anyone registers a spec. The SDK matches
 * it with its own automaton, in time linear in the value, and keeps the
 * guest's two skips (an over-long value, the nested quantifier shape) so the
 * two engines give one verdict.
 */
describe("safeRegexTest — linear-time pattern matching", () => {
    it("matches overlapping alternation in linear time (^(a|a)*$ on 40 a's and !)", () => {
        const pattern = "^(a|a)*$";
        expect(isPortablePattern(pattern)).toBe(true);
        expect(isPotentiallyCatastrophicRegex(pattern)).toBe(false);
        const start = performance.now();
        const verdict = safeRegexTest(pattern, "a".repeat(40) + "!");
        const elapsed = performance.now() - start;
        expect(verdict).toBe(false);
        expect(elapsed).toBeLessThan(250);
        expect(safeRegexTest(pattern, "a".repeat(40))).toBe(true);
    });

    it("validates a spec carrying ^(a|a)*$ in linear time, at the input bound too", () => {
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
        const verdict = validateContent({ s: "a".repeat(MAX_PATTERN_TEST_INPUT - 1) + "!" }, parsed.spec);
        expect(performance.now() - start).toBeLessThan(1000);
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

    it("treats a pattern outside the portable core as satisfied (no spec parses with one)", () => {
        expect(portablePatternMatches("(unclosed", "anything")).toBeNull();
        expect(safeRegexTest("(unclosed", "anything")).toBe(true);
        expect(safeRegexTest("^(?=a).*$", "b")).toBe(true);
    });

    it("skips (satisfied) an input longer than the cap, as the guest does", () => {
        const longInput = "x".repeat(MAX_PATTERN_TEST_INPUT + 1);
        expect(safeRegexTest("^y+$", longInput)).toBe(true);
    });

    it("skips (satisfied) the nested quantifier shape, as the guest does, and the automaton alone is linear on it", () => {
        const evil = ["(a+)", "+$"].join("");
        const input = "a".repeat(46) + "!";
        expect(safeRegexTest(evil, input)).toBe(true);
        const start = performance.now();
        expect(portablePatternMatches(evil, input)).toBe(false);
        expect(performance.now() - start).toBeLessThan(250);
    });

    it("compiles a pattern of zero expanded size without blowing up", () => {
        const pattern = `^${"(?:".repeat(4)}${"|".repeat(40)}${"){64}".repeat(4)}a$`;
        expect(isPortablePattern(pattern)).toBe(true);
        const start = performance.now();
        expect(portablePatternMatches(pattern, "a")).toBe(true);
        expect(portablePatternMatches(pattern, "b")).toBe(false);
        expect(performance.now() - start).toBeLessThan(250);
    });
});

describe("isPotentiallyCatastrophicRegex — the guest's skip shape", () => {
    it("flags nested quantifiers", () => {
        expect(isPotentiallyCatastrophicRegex("(a+)+")).toBe(true);
        expect(isPotentiallyCatastrophicRegex("(a*)*")).toBe(true);
        expect(isPotentiallyCatastrophicRegex("(a+)*")).toBe(true);
        expect(isPotentiallyCatastrophicRegex("(a{2,})+")).toBe(true);
        expect(isPotentiallyCatastrophicRegex("((x+))+")).toBe(true);
    });

    it("does NOT flag ordinary patterns", () => {
        expect(isPotentiallyCatastrophicRegex("^[0-9]+$")).toBe(false);
        expect(isPotentiallyCatastrophicRegex("^0x[0-9a-fA-F]{40}$")).toBe(false);
        expect(isPotentiallyCatastrophicRegex("(abc)+")).toBe(false); // group quantified, body not
        expect(isPotentiallyCatastrophicRegex("[+*]+")).toBe(false); // quantifier chars are literals in a class
        expect(isPotentiallyCatastrophicRegex("\\(a+\\)+")).toBe(false); // escaped parens are literals
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
