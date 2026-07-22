import { describe, expect, it } from "vitest";
import {
    safeRegexTest,
    isPotentiallyCatastrophicRegex,
    MAX_PATTERN_TEST_INPUT,
} from "../../src/clauses/safeRegex.js";

/**
 * ReDoS defence for an attacker-authored clause `pattern` (frontend security
 * audit 2026-07-22, finding 5). The binding property is that a pathological
 * pattern cannot hang the caller — it must return quickly and treat the pattern
 * as satisfied.
 */
describe("safeRegexTest — ReDoS-safe pattern matching", () => {
    it("returns quickly (satisfied) for a catastrophic pattern that would otherwise hang", () => {
        // The classic exponential: (a+)+$ against many 'a' then a non-matching char.
        const evil = "(a+)+$";
        const input = "a".repeat(46) + "!"; // native RegExp would explore ~2^46 paths
        const start = Date.now();
        const result = safeRegexTest(evil, input);
        const elapsed = Date.now() - start;
        expect(result).toBe(true); // treated as satisfied (skipped)
        expect(elapsed).toBeLessThan(50); // and it did NOT backtrack
    });

    it("still enforces a safe, non-matching pattern", () => {
        expect(safeRegexTest("^[0-9]+$", "12345")).toBe(true);
        expect(safeRegexTest("^[0-9]+$", "12a45")).toBe(false);
    });

    it("treats an invalid regex as satisfied (not the input's fault)", () => {
        expect(safeRegexTest("(unclosed", "anything")).toBe(true);
    });

    it("skips (satisfied) an input longer than the cap", () => {
        const longInput = "x".repeat(MAX_PATTERN_TEST_INPUT + 1);
        expect(safeRegexTest("^y+$", longInput)).toBe(true);
    });
});

describe("isPotentiallyCatastrophicRegex — the exponential-shape screen", () => {
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
