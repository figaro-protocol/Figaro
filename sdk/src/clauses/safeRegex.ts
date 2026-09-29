/**
 * @figaro-protocol/sdk/clauses — ReDoS-safe matching of an attacker-authored clause
 * `pattern` against a value.
 *
 * A clause spec is permissionless: any author registers one, so a field's
 * `pattern` (the regex a string field must match) is UNTRUSTED input. Native
 * JavaScript `RegExp` has no backtracking budget, so a pathological pattern
 * such as `(a+)+$` run against a mismatching input hangs the thread — a denial
 * of service on whoever validates that field (the signer typing into it, or the
 * SDK's off-chain content check). *
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

// ── The portable pattern ─────────────────────────────────────────────────────
//
// A pattern is read by two regex libraries: JavaScript's here, Rust's in the
// guest (`prover/clause`). They agree on a core and part ways outside it —
// lookaround and backreferences exist in one, inline flags and possessive
// quantifiers in the other; `\d`, `\w`, `.` and a negated class read
// differently outside ASCII; `[a&&b]` is three characters here and an
// intersection there. A clause both paths read alike is written in the core:
//
//   - the pattern is printable ASCII (0x20–0x7E);
//   - atoms: a literal, `.`, a class `[...]`, a group `(...)` or `(?:...)`,
//     `\d \D \w \W \s \S`, and an escaped punctuation character;
//   - assertions: `^`, `$`, `\b`, `\B`;
//   - alternation `|`;
//   - quantifiers, after an atom only: `*`, `+`, `?`, `{n}`, `{n,}`, `{n,m}`
//     with n ≤ m ≤ MAX_PATTERN_REPEAT, each optionally lazy (`?`);
//   - a class holds literals, ranges `a-z` between two literals, the six
//     letter escapes, escaped punctuation, and `-` first or last; it is never
//     empty, and holds no `[`, no `&&`, `--` or `~~`.
//
// `isPortablePattern` is the one statement of that core; the guest's
// `is_portable_pattern` is its port, and the two are conformance-locked. A
// spec whose pattern is outside the core does not parse, in either engine.
// A patterned field's VALUE is printable ASCII too: outside it the two
// libraries count and classify characters differently.

/** Longest pattern a spec may declare. */
export const MAX_PATTERN_LENGTH = 256;
/** Largest count a `{n,m}` quantifier may name. */
export const MAX_PATTERN_REPEAT = 64;

const ESCAPABLE_PUNCTUATION = "\\.+*?()|[]{}^$-/#&~,:;=!@%\"'`";
const CLASS_LETTERS = "dDwWsS";

function isPrintableAsciiCode(code: number): boolean {
    return code >= 0x20 && code <= 0x7e;
}

/** Is every character of `value` printable ASCII (0x20–0x7E)? */
export function isPrintableAscii(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        if (!isPrintableAsciiCode(value.charCodeAt(i))) return false;
    }
    return true;
}

/** Reads a class starting at `pattern[start] === "["`; returns the index past
 *  its `]`, or -1 when the class is outside the portable core. */
function scanClass(pattern: string, start: number): number {
    let i = start + 1;
    if (pattern[i] === "^") i++;
    const first = i;
    // Was the previous item a plain literal (a range may start from it)?
    let rangeFrom: string | null = null;
    while (i < pattern.length && pattern[i] !== "]") {
        const c = pattern[i];
        if (c === "[") return -1;
        if ((c === "&" || c === "~") && pattern[i + 1] === c) return -1;
        if (c === "-") {
            const next = pattern[i + 1];
            if (next === "-") return -1;
            if (i === first || next === "]") {
                rangeFrom = null;
                i++;
                continue;
            }
            // A range: a plain literal on each side, in order.
            if (rangeFrom === null || next === undefined || next === "\\" || next === "[" || next === "-") return -1;
            if (next.charCodeAt(0) < rangeFrom.charCodeAt(0)) return -1;
            rangeFrom = null;
            i += 2;
            // The character after a range starts afresh: `a-z-9` is no range.
            if (pattern[i] === "-" && pattern[i + 1] !== "]") return -1;
            continue;
        }
        if (c === "\\") {
            const e = pattern[i + 1];
            if (e === undefined) return -1;
            if (!CLASS_LETTERS.includes(e) && !ESCAPABLE_PUNCTUATION.includes(e)) return -1;
            rangeFrom = null;
            i += 2;
            continue;
        }
        rangeFrom = c;
        i++;
    }
    if (i >= pattern.length || i === first) return -1;
    return i + 1;
}

/** Reads a counted quantifier starting at `pattern[start] === "{"`; returns
 *  the index past its `}`, or -1 when it is malformed or over the bound. */
function scanCount(pattern: string, start: number): number {
    const readNumber = (from: number): [number, number] | null => {
        let i = from;
        while (i < pattern.length && pattern[i] >= "0" && pattern[i] <= "9") i++;
        if (i === from || i - from > 3) return null;
        return [Number(pattern.slice(from, i)), i];
    };
    const low = readNumber(start + 1);
    if (low === null) return -1;
    let [n, i] = low;
    let m = n;
    if (pattern[i] === ",") {
        i++;
        if (pattern[i] === "}") {
            m = n;
        } else {
            const high = readNumber(i);
            if (high === null) return -1;
            [m, i] = high;
        }
    }
    if (pattern[i] !== "}") return -1;
    if (n > m || m > MAX_PATTERN_REPEAT) return -1;
    return i + 1;
}

/**
 * Is `pattern` written in the portable core — the constructs JavaScript's
 * regex library and Rust's read alike? See the statement above.
 */
export function isPortablePattern(pattern: string): boolean {
    if (pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) return false;
    if (!isPrintableAscii(pattern)) return false;
    let depth = 0;
    // May a quantifier follow what was just read?
    let atom = false;
    let i = 0;
    while (i < pattern.length) {
        const c = pattern[i];
        if (c === "\\") {
            const e = pattern[i + 1];
            if (e === undefined) return false;
            if (e === "b" || e === "B") {
                atom = false;
            } else if (CLASS_LETTERS.includes(e) || ESCAPABLE_PUNCTUATION.includes(e)) {
                atom = true;
            } else {
                return false;
            }
            i += 2;
        } else if (c === "[") {
            i = scanClass(pattern, i);
            if (i < 0) return false;
            atom = true;
        } else if (c === "(") {
            depth++;
            i++;
            if (pattern[i] === "?") {
                if (pattern[i + 1] !== ":") return false;
                i += 2;
            }
            atom = false;
        } else if (c === ")") {
            if (depth === 0) return false;
            depth--;
            i++;
            atom = true;
        } else if (c === "*" || c === "+" || c === "?" || c === "{") {
            if (!atom) return false;
            if (c === "{") {
                i = scanCount(pattern, i);
                if (i < 0) return false;
            } else {
                i++;
            }
            if (pattern[i] === "?") i++; // lazy
            atom = false;
        } else if (c === "]" || c === "}") {
            return false;
        } else if (c === "|" || c === "^" || c === "$") {
            atom = false;
            i++;
        } else {
            atom = true;
            i++;
        }
    }
    return depth === 0;
}

/**
 * ReDoS-safe replacement for `new RegExp(pattern).test(value)`. Returns `false`
 * when the value leaves printable ASCII, or when a safe, valid pattern
 * definitively does not match. Returns `true` (satisfied) when the pattern
 * matches, when the pattern is unsafe to run, when it is not a valid regex, or
 * when the input is over-long.
 */
export function safeRegexTest(pattern: string, value: string): boolean {
    if (!isPrintableAscii(value)) return false;
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
