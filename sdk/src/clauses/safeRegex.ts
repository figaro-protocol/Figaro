/**
 * @figaro-protocol/sdk/clauses — matching a clause's `pattern` against a value
 * in time linear in the value.
 *
 * A clause spec is permissionless: anyone registers one, so a field's
 * `pattern` (the regex a string field must match) is UNTRUSTED input. A
 * backtracking engine such as JavaScript's `RegExp` takes exponential time on
 * a pattern such as `(a+)+$` or `^(a|a)*$` against a value that almost
 * matches, and that blocks whoever validates the field: the sign gate, a
 * seller's agent, a checkout page. The SDK therefore never runs a spec's
 * pattern on `RegExp`. It compiles the pattern, once, into a Thompson
 * automaton over the portable core (the statement below) and runs that
 * automaton as a state set over the value: each character is read once,
 * against at most every state of the automaton, so the work is bounded by
 * the automaton's size times the value's length. The guest's `regex` crate
 * (`prover/clause/src/validate.rs`) is also an automaton engine, and the two
 * give one verdict on every portable pattern.
 *
 * Two bounds, the guest's too, keep that work small. A pattern whose
 * expanded size (the statement below) is past MAX_PATTERN_EXPANSION does not
 * parse. A value whose length times its pattern's expanded size is past
 * MAX_PATTERN_WORK is refused without the pattern run
 * (`patternWorkExceeded`). Every other value is run against its pattern.
 */

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
//   - the expanded size is at most MAX_PATTERN_EXPANSION. Each atom and each
//     assertion counts one; each `|` counts one; a group counts one more than
//     what it holds; `*`, `+` and `?` count one more than what they follow;
//     and a counted quantifier counts what it follows plus one, times `m` for
//     `{n,m}`, `n` for `{n}` and `n + 1` for `{n,}`. The size counts every
//     state an automaton holds, so it bounds the work per character of the
//     value, in both engines: the SDK's automaton holds at most three
//     instructions per unit, and the guest's no more. Nested counts multiply,
//     so `(?:(?:(?:(?:a{64}){64}){64}){64})` is short and portable in every
//     other way, and still too large;
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
/** Largest expanded size a pattern may have (the statement above). Any
 *  running total past it is held at MAX_PATTERN_EXPANSION + 1, so the count
 *  is the same exact integer in both engines. */
export const MAX_PATTERN_EXPANSION = 4096;
/** Largest work a value may cost its pattern: the value's length in UTF-16
 *  units times the pattern's expanded size. A value past it is refused,
 *  never counted as matching. A pattern at MAX_PATTERN_EXPANSION may run on
 *  1,024 characters; a pattern of size 10 on 419,430. */
export const MAX_PATTERN_WORK = 1 << 22;
/** Largest work one content may cost its patterns: the sum, over every
 *  value a pattern is run on, of its length times its pattern's expanded
 *  size (`validateContent`). Past it the content is refused. It admits some
 *  1,900 values under a 32-byte-hash pattern (size 132, 66 characters). */
export const MAX_CONTENT_PATTERN_WORK = 1 << 24;

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

/** The factor a counted quantifier `pattern.slice(start, end)`, already
 *  scanned, multiplies by: `m` for `{n,m}`, `n` for `{n}`, `n + 1` for `{n,}`. */
function countFactor(pattern: string, start: number, end: number): number {
    const [low, high] = pattern.slice(start + 1, end - 1).split(",");
    if (high === undefined) return Number(low);
    if (high === "") return Number(low) + 1;
    return Number(high);
}

const EXPANSION_CAP = MAX_PATTERN_EXPANSION + 1;
const capped = (n: number) => Math.min(n, EXPANSION_CAP);

/**
 * Is `pattern` written in the portable core — the constructs JavaScript's
 * regex library and Rust's read alike? See the statement above.
 */
export function isPortablePattern(pattern: string): boolean {
    return portablePatternSize(pattern) !== null;
}

/**
 * The expanded size of a portable `pattern` (the statement above), or null
 * when the pattern is outside the portable core. The guest's
 * `portable_pattern_size` computes the same integer.
 */
export function portablePatternSize(pattern: string): number | null {
    if (pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) return null;
    if (!isPrintableAscii(pattern)) return null;
    // The expanded size of each open group, the whole pattern at the bottom.
    const sizes = [0];
    // May a quantifier follow what was just read? If so, `last` is that
    // item's size, and `before` is its group's size without it.
    let atom = false;
    let last = 0;
    let before = 0;
    const add = (n: number) => {
        sizes[sizes.length - 1] = capped(sizes[sizes.length - 1] + n);
    };
    const item = (n: number) => {
        atom = true;
        last = n;
        before = sizes[sizes.length - 1];
        add(n);
    };
    let i = 0;
    while (i < pattern.length) {
        const c = pattern[i];
        if (c === "\\") {
            const e = pattern[i + 1];
            if (e === undefined) return null;
            if (e === "b" || e === "B") {
                atom = false;
                add(1);
            } else if (CLASS_LETTERS.includes(e) || ESCAPABLE_PUNCTUATION.includes(e)) {
                item(1);
            } else {
                return null;
            }
            i += 2;
        } else if (c === "[") {
            i = scanClass(pattern, i);
            if (i < 0) return null;
            item(1);
        } else if (c === "(") {
            sizes.push(0);
            i++;
            if (pattern[i] === "?") {
                if (pattern[i + 1] !== ":") return null;
                i += 2;
            }
            atom = false;
        } else if (c === ")") {
            if (sizes.length === 1) return null;
            // A group counts one more than what it holds.
            item(capped((sizes.pop() as number) + 1));
            i++;
        } else if (c === "*" || c === "+" || c === "?" || c === "{") {
            if (!atom) return null;
            let stands: number;
            if (c === "{") {
                const end = scanCount(pattern, i);
                if (end < 0) return null;
                // The item and its one unit stand `factor` times.
                stands = capped((last + 1) * countFactor(pattern, i, end));
                i = end;
            } else {
                // `*`, `+` and `?` count one more than the item.
                stands = capped(last + 1);
                i++;
            }
            if (pattern[i] === "?") i++; // lazy
            // The item was counted once; it stands as `stands`.
            sizes[sizes.length - 1] = capped(before + stands);
            atom = false;
        } else if (c === "]" || c === "}") {
            return null;
        } else if (c === "|") {
            atom = false;
            add(1);
            i++;
        } else if (c === "^" || c === "$") {
            atom = false;
            add(1);
            i++;
        } else {
            item(1);
            i++;
        }
    }
    return sizes.length === 1 && sizes[0] <= MAX_PATTERN_EXPANSION ? sizes[0] : null;
}

/**
 * Would running `pattern` on `value` cost more than MAX_PATTERN_WORK: is
 * the value's length in UTF-16 units times the pattern's expanded size past
 * it? Such a value is refused without the pattern run. False for a pattern
 * outside the portable core, which never parses and which `safeRegexTest`
 * refuses on its own. The guest's `pattern_work_exceeded` gives the same
 * answer.
 */
export function patternWorkExceeded(pattern: string, value: string): boolean {
    const size = portablePatternSize(pattern);
    return size !== null && value.length * size > MAX_PATTERN_WORK;
}

// ── The linear-time matcher ──────────────────────────────────────────────────
//
// A portable pattern is parsed into a tree, the tree is compiled into a
// Thompson automaton (one instruction array), and the automaton runs over the
// value as a set of states: each step reads one character and moves every
// live state at once, so no choice is ever retried. The verdict is whether the
// pattern matches anywhere in the value, which is what `RegExp.prototype.test`
// and the guest's `Regex::is_match` both answer. Laziness changes which match
// a backtracking engine reports, never whether one exists, so a lazy
// quantifier compiles as its greedy form. The classes are read as the guest
// reads them, with its Unicode tables off: `\d` is `[0-9]`, `\w` is
// `[0-9A-Za-z_]`, `\s` is `[\t\n\v\f\r ]`, `.` is every character but `\n`,
// and `\b` is the boundary between a `\w` character and any other. On a
// printable-ASCII value, the only kind a pattern runs on, JavaScript's
// classes match the same characters.

/** One character set: an entry per ASCII code, 1 when the set holds it. */
type CharSet = Uint8Array;

type PatternNode =
    | { t: "set"; set: CharSet }
    | { t: "assert"; k: "^" | "$" | "b" | "B" }
    | { t: "cat"; items: PatternNode[] }
    | { t: "alt"; alts: PatternNode[] }
    | { t: "rep"; node: PatternNode; min: number; max: number };

const EMPTY_NODE: PatternNode = { t: "cat", items: [] };

function charSet(holds: (code: number) => boolean): CharSet {
    const set = new Uint8Array(128);
    for (let c = 0; c < 128; c++) set[c] = holds(c) ? 1 : 0;
    return set;
}

const isDigitCode = (c: number) => c >= 0x30 && c <= 0x39;
const isWordCode = (c: number) =>
    isDigitCode(c) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 0x5f;
const isSpaceCode = (c: number) => c === 0x20 || (c >= 0x09 && c <= 0x0d);

/** The set a class letter (`d D w W s S`) names. */
function letterSet(letter: string): CharSet {
    const lower = letter.toLowerCase();
    const base = lower === "d" ? isDigitCode : lower === "w" ? isWordCode : isSpaceCode;
    const negated = letter !== lower;
    return charSet((c) => base(c) !== negated);
}

const ANY_BUT_NEWLINE = charSet((c) => c !== 0x0a);

function literalSet(ch: string): CharSet {
    const code = ch.charCodeAt(0);
    return charSet((c) => c === code);
}

/** Parses a pattern `isPortablePattern` accepted. Each construct is read
 *  only in the form the portable core allows it. */
function parsePortable(pattern: string): PatternNode {
    let i = 0;

    const parseClass = (): PatternNode => {
        i++; // `[`
        const negated = pattern[i] === "^";
        if (negated) i++;
        const set = new Uint8Array(128);
        const union = (other: CharSet) => {
            for (let c = 0; c < 128; c++) set[c] |= other[c];
        };
        while (pattern[i] !== "]") {
            const c = pattern[i];
            if (c === "\\") {
                const e = pattern[i + 1];
                union(CLASS_LETTERS.includes(e) ? letterSet(e) : literalSet(e));
                i += 2;
                continue;
            }
            // A range: the core allows one only between two plain literals,
            // and never from `-`.
            if (c !== "-" && pattern[i + 1] === "-" && pattern[i + 2] !== "]") {
                const to = pattern.charCodeAt(i + 2);
                for (let code = c.charCodeAt(0); code <= to; code++) set[code] = 1;
                i += 3;
                continue;
            }
            set[c.charCodeAt(0)] = 1;
            i++;
        }
        i++; // `]`
        if (negated) for (let c = 0; c < 128; c++) set[c] ^= 1;
        return { t: "set", set };
    };

    const parseAtom = (): PatternNode => {
        const c = pattern[i];
        if (c === "\\") {
            const e = pattern[i + 1];
            i += 2;
            if (e === "b" || e === "B") return { t: "assert", k: e };
            return { t: "set", set: CLASS_LETTERS.includes(e) ? letterSet(e) : literalSet(e) };
        }
        if (c === "[") return parseClass();
        if (c === "(") {
            i++;
            if (pattern[i] === "?") i += 2; // `?:`
            const inner = parseAlt();
            i++; // `)`
            return inner;
        }
        i++;
        if (c === ".") return { t: "set", set: ANY_BUT_NEWLINE };
        if (c === "^" || c === "$") return { t: "assert", k: c };
        return { t: "set", set: literalSet(c) };
    };

    const parseQuantified = (): PatternNode => {
        const atom = parseAtom();
        const q = pattern[i];
        let min: number;
        let max: number;
        if (q === "*") {
            [min, max] = [0, Infinity];
            i++;
        } else if (q === "+") {
            [min, max] = [1, Infinity];
            i++;
        } else if (q === "?") {
            [min, max] = [0, 1];
            i++;
        } else if (q === "{") {
            const end = pattern.indexOf("}", i);
            const [low, high] = pattern.slice(i + 1, end).split(",");
            min = Number(low);
            max = high === undefined ? min : high === "" ? Infinity : Number(high);
            i = end + 1;
        } else {
            return atom;
        }
        if (pattern[i] === "?") i++; // lazy: the same verdict
        return { t: "rep", node: atom, min, max };
    };

    const parseSeq = (): PatternNode => {
        const items: PatternNode[] = [];
        while (i < pattern.length && pattern[i] !== "|" && pattern[i] !== ")") items.push(parseQuantified());
        return { t: "cat", items };
    };

    const parseAlt = (): PatternNode => {
        const alts = [parseSeq()];
        while (pattern[i] === "|") {
            i++;
            alts.push(parseSeq());
        }
        return alts.length === 1 ? alts[0] : { t: "alt", alts };
    };

    return parseAlt();
}

/** Does the node match only the empty string, with no assertion in it? */
function isEmptyNode(node: PatternNode): boolean {
    switch (node.t) {
        case "set":
        case "assert":
            return false;
        case "cat":
            return node.items.every(isEmptyNode);
        case "alt":
            return node.alts.every(isEmptyNode);
        case "rep":
            return node.max === 0 || isEmptyNode(node.node);
    }
}

/** Is the repetition one of `?`, `*` and `+`, in whatever written form? */
const isPlainRep = (min: number, max: number) => (min === 0 || min === 1) && (max === 1 || max === Infinity);

/** `node` repeated `min` to `max` times, written with the fewest
 *  instructions. A plain repetition of a plain repetition is one: `(x?)?`
 *  is `x?`, `(x+)?`, `(x?)*` and `(x*)+` are `x*`, `(x+)+` is `x+`. */
function repeat(node: PatternNode, min: number, max: number): PatternNode {
    if (min === 1 && max === 1) return node;
    if (node.t === "rep" && isPlainRep(min, max) && isPlainRep(node.min, node.max)) {
        const inner = node.max === Infinity || max === Infinity ? Infinity : 1;
        return repeat(node.node, node.min * min, inner);
    }
    return { t: "rep", node, min, max };
}

/** The node with every empty part dropped, an alternation's empty branches
 *  kept as one, and the wrappers that hold no character removed: a sequence
 *  or an alternation of one item is that item, an alternation of one item
 *  and the empty branch is `?`, and a plain repetition of a plain repetition
 *  is one (`repeat`). No verdict changes, and the automaton only shrinks:
 *  `(?:(?:(?:a)+)+)+` compiles as `a+`. */
function simplify(node: PatternNode): PatternNode {
    if (isEmptyNode(node)) return EMPTY_NODE;
    switch (node.t) {
        case "set":
        case "assert":
            return node;
        case "cat": {
            const items = node.items.filter((n) => !isEmptyNode(n)).map(simplify);
            return items.length === 1 ? items[0] : { t: "cat", items };
        }
        case "alt": {
            const alts = node.alts.filter((n) => !isEmptyNode(n)).map(simplify);
            const hadEmpty = alts.length < node.alts.length;
            if (alts.length === 1) return hadEmpty ? repeat(alts[0], 0, 1) : alts[0];
            if (hadEmpty) alts.push(EMPTY_NODE);
            return { t: "alt", alts };
        }
        case "rep":
            return repeat(simplify(node.node), node.min, node.max);
    }
}

/** The instruction kinds of the automaton. */
const OP_SET = 0;
const OP_SPLIT = 1;
const OP_JMP = 2;
const OP_ASSERT = 3;
const OP_MATCH = 4;

interface PatternProgram {
    op: number[];
    /** OP_SET: the set; OP_ASSERT: the assertion. */
    arg: (CharSet | string | null)[];
    /** OP_SPLIT and OP_JMP: the target; OP_SPLIT also goes on to pc + 1. */
    target: number[];
}

/** Largest automaton compiled; no portable pattern reaches it, so every
 *  portable pattern compiles. By induction over the tree, a node of
 *  expanded size `s` compiles to at most `3s` instructions: a set or an
 *  assertion is one; an alternation adds a split and a jump per `|`, which
 *  counts one; `*`, `+` and `?` add at most two, and count one more than
 *  what they follow, which counts at least one; a counted quantifier writes
 *  its item at most `m` times with a split each, and counts `m` times the
 *  item plus one. The simplification only removes instructions. */
const MAX_PROGRAM_SIZE = 3 * MAX_PATTERN_EXPANSION + 1;

function compilePortable(root: PatternNode): PatternProgram | null {
    const prog: PatternProgram = { op: [], arg: [], target: [] };
    const emit = (op: number, arg: CharSet | string | null = null, target = -1): number => {
        prog.op.push(op);
        prog.arg.push(arg);
        prog.target.push(target);
        return prog.op.length - 1;
    };
    const emitNode = (node: PatternNode): boolean => {
        if (prog.op.length > MAX_PROGRAM_SIZE) return false;
        switch (node.t) {
            case "set":
                emit(OP_SET, node.set);
                return true;
            case "assert":
                emit(OP_ASSERT, node.k);
                return true;
            case "cat":
                return node.items.every(emitNode);
            case "alt": {
                const jumps: number[] = [];
                for (let k = 0; k < node.alts.length; k++) {
                    const last = k === node.alts.length - 1;
                    const split = last ? -1 : emit(OP_SPLIT);
                    if (!emitNode(node.alts[k])) return false;
                    if (!last) {
                        jumps.push(emit(OP_JMP));
                        prog.target[split] = prog.op.length;
                    }
                }
                for (const j of jumps) prog.target[j] = prog.op.length;
                return true;
            }
            case "rep": {
                if (node.max === Infinity) {
                    // `x{n,}` is n − 1 copies of x, then one copy that may
                    // repeat; `x*` is a split over one copy. One copy loops,
                    // so `x+` is never written twice.
                    for (let k = 1; k < node.min; k++) if (!emitNode(node.node)) return false;
                    if (node.min > 0) {
                        const start = prog.op.length;
                        if (!emitNode(node.node)) return false;
                        emit(OP_SPLIT, null, start);
                        return true;
                    }
                    const split = emit(OP_SPLIT);
                    if (!emitNode(node.node)) return false;
                    emit(OP_JMP, null, split);
                    prog.target[split] = prog.op.length;
                    return true;
                }
                for (let k = 0; k < node.min; k++) if (!emitNode(node.node)) return false;
                const splits: number[] = [];
                for (let k = node.min; k < node.max; k++) {
                    splits.push(emit(OP_SPLIT));
                    if (!emitNode(node.node)) return false;
                }
                for (const s of splits) prog.target[s] = prog.op.length;
                return true;
            }
        }
    };
    if (!emitNode(root)) return null;
    emit(OP_MATCH);
    return prog.op.length > MAX_PROGRAM_SIZE ? null : prog;
}

/** Compiled automata, by pattern: a spec's pattern is compiled once, when it
 *  is first matched, and reused for every value after. The cache empties
 *  when it fills, so a stream of new patterns cannot grow it without bound. */
const PROGRAMS = new Map<string, PatternProgram | null>();
const MAX_CACHED_PROGRAMS = 1024;

function programOf(pattern: string): PatternProgram | null {
    const cached = PROGRAMS.get(pattern);
    if (cached !== undefined) return cached;
    const prog = isPortablePattern(pattern) ? compilePortable(simplify(parsePortable(pattern))) : null;
    if (PROGRAMS.size >= MAX_CACHED_PROGRAMS) PROGRAMS.clear();
    PROGRAMS.set(pattern, prog);
    return prog;
}

/**
 * Does the portable `pattern` match somewhere in `value`? The automaton runs
 * as a state set, so the work is at most the automaton's size times
 * `value.length + 1`, whatever the pattern and the value. Returns null when
 * `pattern` is outside the portable core: such a pattern never parses in a
 * spec, and this matcher reads no other syntax. A character of `value` past
 * ASCII matches no set.
 */
export function portablePatternMatches(pattern: string, value: string): boolean | null {
    const prog = programOf(pattern);
    if (prog === null) return null;
    const n = value.length;
    const isWordAt = (p: number) => {
        if (p < 0 || p >= n) return false;
        const c = value.charCodeAt(p);
        return c < 128 && isWordCode(c);
    };
    // `seen[pc] === stamp`: the state is already in the set being built.
    const seen = new Int32Array(prog.op.length).fill(-1);
    let stamp = 0;
    let current: number[] = [];
    let next: number[] = [];
    const stack: number[] = [];

    /** Adds `start` and every state it reaches without reading a character,
     *  at position `pos`, to `list`. True when the match state is reached. */
    const add = (list: number[], start: number, pos: number): boolean => {
        stack.push(start);
        while (stack.length > 0) {
            const pc = stack.pop() as number;
            if (seen[pc] === stamp) continue;
            seen[pc] = stamp;
            switch (prog.op[pc]) {
                case OP_MATCH:
                    stack.length = 0;
                    return true;
                case OP_SET:
                    list.push(pc);
                    break;
                case OP_JMP:
                    stack.push(prog.target[pc]);
                    break;
                case OP_SPLIT:
                    stack.push(prog.target[pc], pc + 1);
                    break;
                case OP_ASSERT: {
                    const k = prog.arg[pc];
                    const holds =
                        k === "^" ? pos === 0 :
                        k === "$" ? pos === n :
                        k === "b" ? isWordAt(pos - 1) !== isWordAt(pos) :
                        isWordAt(pos - 1) === isWordAt(pos);
                    if (holds) stack.push(pc + 1);
                    break;
                }
            }
        }
        return false;
    };

    for (let pos = 0; ; pos++) {
        // A match may start at any position, so the start state joins the set.
        if (add(current, 0, pos)) return true;
        if (pos === n) return false;
        stamp++;
        const c = value.charCodeAt(pos);
        next.length = 0;
        for (const pc of current) {
            const set = prog.arg[pc] as CharSet;
            if (c < 128 && set[c] === 1 && add(next, pc + 1, pos + 1)) return true;
        }
        [current, next] = [next, current];
    }
}

/**
 * Can `pattern` be run: is it portable, and does its automaton build? A spec
 * parses only with such a pattern (`parseClauseSpec`), as the guest parses
 * one only when the pattern compiles.
 */
export function isRunnablePattern(pattern: string): boolean {
    return programOf(pattern) !== null;
}

/**
 * Tests `value` against a clause's `pattern` in linear time. Returns `true`
 * only when the pattern matches. Returns `false` when the value leaves
 * printable ASCII, when it would cost the pattern more than MAX_PATTERN_WORK
 * (`patternWorkExceeded`), when the pattern cannot be run
 * (`isRunnablePattern`), or when it does not match: a value that was not
 * checked never counts as matching. The guest's `safe_regex_test` gives the
 * same verdict on every case a parsed spec reaches.
 */
export function safeRegexTest(pattern: string, value: string): boolean {
    if (!isPrintableAscii(value)) return false;
    if (patternWorkExceeded(pattern, value)) return false;
    return portablePatternMatches(pattern, value) ?? false;
}
