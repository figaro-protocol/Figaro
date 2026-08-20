/**
 * @figaro-protocol/sdk/clauses — ReDoS-safe matching of an attacker-authored clause
 * `pattern` against a value.
 *
 * A clause spec is permissionless: any author registers one, so a field's
 * `pattern` (the regex a string field must match) is UNTRUSTED input. Native
 * JavaScript `RegExp` has no backtracking budget, so a pathological pattern
 * such as `(a+)+$` run against a mismatching input hangs the thread — a denial
 * of service on whoever validates that field (the signer typing into it, or the
 * SDK's Layer-A content check). See the frontend security audit 2026-07-22,
 * finding 5.
 *
 * `safeRegexTest` bounds the exposure two ways: it refuses to run a pattern that
 * exhibits the catastrophic-backtracking shape (a quantified group whose body is
 * itself quantified — the exponential class), and it refuses to test an
 * over-long input. In either refusal it treats the pattern as SATISFIED. That is
 * the safe direction here: the client-side `pattern` check is only a UX aid — the
 * binding validation of clause content is the merkle commitment, the
 * counterparty's own review, and downstream forums, never this regex. Skipping a
 * self-declared, self-defeating pattern weakens only that author's own field.
 */

/** Inputs longer than this are not pattern-tested (returns satisfied). Clause
 *  string fields are identifier/short-text scale; this clears every real value
 *  with wide margin while bounding worst-case matching work. */
export const MAX_PATTERN_TEST_INPUT = 4096;

/**
 * Conservatively detect the exponential-backtracking shape: a group `(...)`
 * whose body contains a quantifier (`*`, `+`, or `{…,}`) and which is itself
 * immediately quantified. Catches `(a+)+`, `(a*)*`, `(a+)*`, `(a{2,})+`,
 * `((x+))+`, etc. Escaped metacharacters and character classes are skipped so
 * `\(` / `[+*]` do not false-positive. Alternation-overlap patterns
 * (`(a|ab)*`) are polynomial, not exponential, and out of scope for this
 * screen.
 */
export function isPotentiallyCatastrophicRegex(pattern: string): boolean {
    // Stack entry per open group: whether its body has seen a quantifier yet.
    const groupHasQuantifier: boolean[] = [];
    for (let i = 0; i < pattern.length; i++) {
        const c = pattern[i];
        if (c === "\\") {
            i++; // skip the escaped character
            continue;
        }
        if (c === "[") {
            // Skip a character class wholesale — quantifier chars inside it are literals.
            i++;
            while (i < pattern.length && pattern[i] !== "]") {
                if (pattern[i] === "\\") i++;
                i++;
            }
            continue;
        }
        if (c === "(") {
            groupHasQuantifier.push(false);
            continue;
        }
        const isQuantifier = c === "*" || c === "+" || c === "{";
        if (c === ")") {
            const bodyHadQuantifier = groupHasQuantifier.pop() ?? false;
            // Is this group itself quantified?
            const next = pattern[i + 1];
            const groupQuantified = next === "*" || next === "+" || next === "{";
            if (bodyHadQuantifier && groupQuantified) return true;
            // Any quantifier at or below this group — whether inside its body or
            // applied to the group itself — counts toward the ENCLOSING group's
            // body, so a deeper nesting (`((x+))+`) is still detected when the
            // outer group closes.
            if ((bodyHadQuantifier || groupQuantified) && groupHasQuantifier.length > 0) {
                groupHasQuantifier[groupHasQuantifier.length - 1] = true;
            }
            continue;
        }
        if (isQuantifier && groupHasQuantifier.length > 0) {
            groupHasQuantifier[groupHasQuantifier.length - 1] = true;
        }
    }
    return false;
}

/**
 * ReDoS-safe replacement for `new RegExp(pattern).test(value)`. Returns `true`
 * (satisfied) when the pattern matches, when the pattern is unsafe to run, when
 * it is not a valid regex, or when the input is over-long. Returns `false` only
 * when a safe, valid pattern definitively does not match.
 */
export function safeRegexTest(pattern: string, value: string): boolean {
    if (value.length > MAX_PATTERN_TEST_INPUT) return true;
    if (isPotentiallyCatastrophicRegex(pattern)) return true;
    let re: RegExp;
    try {
        re = new RegExp(pattern);
    } catch {
        return true; // an unparseable spec pattern is the validator's finding, not the input's
    }
    return re.test(value);
}
