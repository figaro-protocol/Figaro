//! Content validator — validates a JSON content value against a parsed
//! `ClauseSpec`. Rust mirror of `sdk/src/clauses/validate.ts`.
//!
//! Call sites: SP1 zkVM prover (where the clause validator runs inside the
//! proof), off-chain sequencer (where it runs before submitting a batch),
//! and any Rust SDK consumer.

use std::collections::HashMap;

use serde_json::Value;

use crate::grain::{cap_of_disposition, grain_cap_of, grain_of, GEOHASH_FORMAT};
use crate::spec::{
    looks_like_decimal_integer, ArrayFieldSpec, BigintFieldSpec, ClauseSpec, DefaultValue,
    Disposition, EnumFieldSpec, FieldSpec, IntegerFieldSpec, ObjectFieldSpec, StringFieldSpec,
    StringFormat,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ValidationError {
    pub path: String,
    pub message: String,
}

#[derive(Debug)]
pub enum ValidationResult {
    Ok,
    Err(Vec<ValidationError>),
}

impl ValidationResult {
    pub fn is_ok(&self) -> bool {
        matches!(self, Self::Ok)
    }

    pub fn is_err(&self) -> bool {
        !self.is_ok()
    }

    pub fn errors(&self) -> &[ValidationError] {
        match self {
            Self::Ok => &[],
            Self::Err(v) => v,
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct ValidateOptions {
    /// If set and the spec has a matching `stages[stage]` override, use those
    /// fields for validation. Otherwise the spec's default `fields` apply.
    pub stage: Option<u8>,
}

// ── Format gates ──────────────────────────────────────────────────────
// Hand-rolled (no `regex`) for the four canonical formats so the
// hot-path doesn't pay regex-engine cost in the zkVM. The user-supplied
// `pattern` field uses regex; nothing else does.

fn is_bytes32_hex(s: &str) -> bool {
    s.len() == 66 && s.starts_with("0x") && s.as_bytes()[2..].iter().all(|b| b.is_ascii_hexdigit())
}

fn is_address_hex(s: &str) -> bool {
    s.len() == 42 && s.starts_with("0x") && s.as_bytes()[2..].iter().all(|b| b.is_ascii_hexdigit())
}

fn is_bytes_hex(s: &str) -> bool {
    if !s.starts_with("0x") {
        return false;
    }
    let body = &s.as_bytes()[2..];
    body.len() % 2 == 0 && body.iter().all(|b| b.is_ascii_hexdigit())
}

/// `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})`
fn is_iso_datetime(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() < 20 {
        return false;
    }
    let digits_at = |i: usize, n: usize| -> bool {
        if i + n > bytes.len() {
            return false;
        }
        bytes[i..i + n].iter().all(|b| b.is_ascii_digit())
    };
    if !digits_at(0, 4)
        || bytes[4] != b'-'
        || !digits_at(5, 2)
        || bytes[7] != b'-'
        || !digits_at(8, 2)
        || bytes[10] != b'T'
        || !digits_at(11, 2)
        || bytes[13] != b':'
        || !digits_at(14, 2)
        || bytes[16] != b':'
        || !digits_at(17, 2)
    {
        return false;
    }
    let mut i = 19;
    if i < bytes.len() && bytes[i] == b'.' {
        i += 1;
        let start = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i == start {
            return false;
        }
    }
    if i >= bytes.len() {
        return false;
    }
    if bytes[i] == b'Z' {
        return i + 1 == bytes.len();
    }
    if bytes[i] != b'+' && bytes[i] != b'-' {
        return false;
    }
    i += 1;
    if !digits_at(i, 2) || i + 2 >= bytes.len() || bytes[i + 2] != b':' || !digits_at(i + 3, 2) {
        return false;
    }
    i + 5 == bytes.len()
}

// ── Field-level validators ────────────────────────────────────────────

/// JS `String.prototype.length` counts UTF-16 code units, not bytes —
/// Layer A's min/maxLength gates use it, so this mirror must too (a
/// byte-length check diverges on any non-ASCII content).
fn utf16_len(s: &str) -> usize {
    s.chars().map(char::len_utf16).sum()
}

/// Inputs longer than this (UTF-16 units, matching Layer A) are not
/// pattern-tested. Mirror of `MAX_PATTERN_TEST_INPUT` in
/// `sdk/src/clauses/safeRegex.ts`.
const MAX_PATTERN_TEST_INPUT: usize = 4096;

/// Conservatively detect the exponential-backtracking shape — a quantified
/// group whose body is itself quantified. EXACT port of
/// `isPotentiallyCatastrophicRegex` in `sdk/src/clauses/safeRegex.ts`; the two
/// are conformance-locked, so the skip decision must be byte-for-byte identical.
fn is_potentially_catastrophic_regex(pattern: &str) -> bool {
    let chars: Vec<char> = pattern.chars().collect();
    let mut group_has_quantifier: Vec<bool> = Vec::new();
    let mut i = 0usize;
    while i < chars.len() {
        let c = chars[i];
        if c == '\\' {
            i += 1; // skip the escaped character
            i += 1;
            continue;
        }
        if c == '[' {
            // Skip a character class wholesale.
            i += 1;
            while i < chars.len() && chars[i] != ']' {
                if chars[i] == '\\' {
                    i += 1;
                }
                i += 1;
            }
            i += 1;
            continue;
        }
        if c == '(' {
            group_has_quantifier.push(false);
            i += 1;
            continue;
        }
        let is_quantifier = c == '*' || c == '+' || c == '{';
        if c == ')' {
            let body_had_quantifier = group_has_quantifier.pop().unwrap_or(false);
            let next = chars.get(i + 1).copied();
            let group_quantified = matches!(next, Some('*') | Some('+') | Some('{'));
            if body_had_quantifier && group_quantified {
                return true;
            }
            if (body_had_quantifier || group_quantified) && !group_has_quantifier.is_empty() {
                let last = group_has_quantifier.len() - 1;
                group_has_quantifier[last] = true;
            }
            i += 1;
            continue;
        }
        if is_quantifier && !group_has_quantifier.is_empty() {
            let last = group_has_quantifier.len() - 1;
            group_has_quantifier[last] = true;
        }
        i += 1;
    }
    false
}

// ── The portable pattern ──────────────────────────────────────────────
//
// The port of `isPortablePattern` in `sdk/src/clauses/safeRegex.ts`, which
// states the core: the constructs JavaScript's regex library and the
// `regex` crate read alike. The two are conformance-locked
// (`tests/engine_vectors.rs`, `tests/fuzz_vectors.rs`); a spec whose pattern
// is outside the core does not parse, here or there.

/// Longest pattern a spec may declare.
const MAX_PATTERN_LENGTH: usize = 256;
/// Largest count a `{n,m}` quantifier may name.
const MAX_PATTERN_REPEAT: u32 = 64;
/// Largest expanded size a pattern may have: each atom and each assertion
/// counts one, a group the sum of what it holds, and a quantifier multiplies
/// what it follows by `m` for `{n,m}`, `n` for `{n}`, `n + 1` for `{n,}`,
/// and one for `*`, `+` and `?`. A running total past it is held at
/// `MAX_PATTERN_EXPANSION + 1`, so the count is the same exact integer as
/// the SDK's. Mirror of `MAX_PATTERN_EXPANSION` in
/// `sdk/src/clauses/safeRegex.ts`.
const MAX_PATTERN_EXPANSION: u32 = 4096;
const EXPANSION_CAP: u32 = MAX_PATTERN_EXPANSION + 1;

const ESCAPABLE_PUNCTUATION: &[u8] = b"\\.+*?()|[]{}^$-/#&~,:;=!@%\"'`";
const CLASS_LETTERS: &[u8] = b"dDwWsS";

/// Is every character of `value` printable ASCII (0x20–0x7E)?
pub(crate) fn is_printable_ascii(value: &str) -> bool {
    value.bytes().all(|b| (0x20..=0x7e).contains(&b))
}

/// Reads a class starting at `p[start] == b'['`; returns the index past its
/// `]`, or `None` when the class is outside the portable core.
fn scan_class(p: &[u8], start: usize) -> Option<usize> {
    let mut i = start + 1;
    if p.get(i) == Some(&b'^') {
        i += 1;
    }
    let first = i;
    // Was the previous item a plain literal (a range may start from it)?
    let mut range_from: Option<u8> = None;
    while i < p.len() && p[i] != b']' {
        let c = p[i];
        if c == b'[' {
            return None;
        }
        if (c == b'&' || c == b'~') && p.get(i + 1) == Some(&c) {
            return None;
        }
        if c == b'-' {
            let next = p.get(i + 1).copied();
            if next == Some(b'-') {
                return None;
            }
            if i == first || next == Some(b']') {
                range_from = None;
                i += 1;
                continue;
            }
            // A range: a plain literal on each side, in order.
            let (from, to) = match (range_from, next) {
                (Some(from), Some(to)) if to != b'\\' && to != b'[' && to != b'-' => (from, to),
                _ => return None,
            };
            if to < from {
                return None;
            }
            range_from = None;
            i += 2;
            // The character after a range starts afresh: `a-z-9` is no range.
            if p.get(i) == Some(&b'-') && p.get(i + 1) != Some(&b']') {
                return None;
            }
            continue;
        }
        if c == b'\\' {
            let e = *p.get(i + 1)?;
            if !CLASS_LETTERS.contains(&e) && !ESCAPABLE_PUNCTUATION.contains(&e) {
                return None;
            }
            range_from = None;
            i += 2;
            continue;
        }
        range_from = Some(c);
        i += 1;
    }
    if i >= p.len() || i == first {
        return None;
    }
    Some(i + 1)
}

/// Reads a counted quantifier starting at `p[start] == b'{'`; returns the
/// index past its `}`, or `None` when it is malformed or over the bound.
fn scan_count(p: &[u8], start: usize) -> Option<usize> {
    fn read_number(p: &[u8], from: usize) -> Option<(u32, usize)> {
        let mut i = from;
        let mut n: u32 = 0;
        while i < p.len() && p[i].is_ascii_digit() {
            n = n * 10 + u32::from(p[i] - b'0');
            i += 1;
            if i - from > 3 {
                return None;
            }
        }
        if i == from {
            return None;
        }
        Some((n, i))
    }
    let (n, mut i) = read_number(p, start + 1)?;
    let mut m = n;
    if p.get(i) == Some(&b',') {
        i += 1;
        if p.get(i) != Some(&b'}') {
            let (high, next) = read_number(p, i)?;
            m = high;
            i = next;
        }
    }
    if p.get(i) != Some(&b'}') {
        return None;
    }
    if n > m || m > MAX_PATTERN_REPEAT {
        return None;
    }
    Some(i + 1)
}

/// The factor a counted quantifier `p[start..end]`, already scanned,
/// multiplies by: `m` for `{n,m}`, `n` for `{n}`, `n + 1` for `{n,}`.
fn count_factor(p: &[u8], start: usize, end: usize) -> u32 {
    let number = |s: &[u8]| s.iter().fold(0u32, |n, d| n * 10 + u32::from(d - b'0'));
    let body = &p[start + 1..end - 1];
    match body.iter().position(|&b| b == b',') {
        None => number(body),
        Some(comma) if comma + 1 == body.len() => number(&body[..comma]) + 1,
        Some(comma) => number(&body[comma + 1..]),
    }
}

/// Is `pattern` written in the portable core?
pub(crate) fn is_portable_pattern(pattern: &str) -> bool {
    let p = pattern.as_bytes();
    // Printable ASCII first: past it a byte is not a character, and Layer
    // A's length is in UTF-16 units.
    if !is_printable_ascii(pattern) || p.is_empty() || p.len() > MAX_PATTERN_LENGTH {
        return false;
    }
    // The expanded size of each open group, the whole pattern at the bottom.
    let mut sizes: Vec<u32> = vec![0];
    // May a quantifier follow what was just read? If so, `last` is that
    // item's size, and `before` is its group's size without it.
    let mut atom = false;
    let mut last = 0u32;
    let mut before = 0u32;
    fn add(sizes: &mut [u32], n: u32) {
        let top = sizes.len() - 1;
        sizes[top] = (sizes[top] + n).min(EXPANSION_CAP);
    }
    let mut i = 0usize;
    while i < p.len() {
        let c = p[i];
        // An item a quantifier may follow, of size `Some(n)`.
        let mut item: Option<u32> = None;
        match c {
            b'\\' => {
                let e = match p.get(i + 1) {
                    Some(e) => *e,
                    None => return false,
                };
                if e == b'b' || e == b'B' {
                    atom = false;
                    add(&mut sizes, 1);
                } else if CLASS_LETTERS.contains(&e) || ESCAPABLE_PUNCTUATION.contains(&e) {
                    item = Some(1);
                } else {
                    return false;
                }
                i += 2;
            }
            b'[' => {
                i = match scan_class(p, i) {
                    Some(next) => next,
                    None => return false,
                };
                item = Some(1);
            }
            b'(' => {
                sizes.push(0);
                i += 1;
                if p.get(i) == Some(&b'?') {
                    if p.get(i + 1) != Some(&b':') {
                        return false;
                    }
                    i += 2;
                }
                atom = false;
            }
            b')' => {
                if sizes.len() == 1 {
                    return false;
                }
                item = sizes.pop();
                i += 1;
            }
            b'*' | b'+' | b'?' | b'{' => {
                if !atom {
                    return false;
                }
                let mut factor = 1u32;
                if c == b'{' {
                    let end = match scan_count(p, i) {
                        Some(next) => next,
                        None => return false,
                    };
                    factor = count_factor(p, i, end);
                    i = end;
                } else {
                    i += 1;
                }
                if p.get(i) == Some(&b'?') {
                    i += 1; // lazy
                }
                // The item was counted once; it stands `factor` times.
                let top = sizes.len() - 1;
                sizes[top] = (before + (last * factor).min(EXPANSION_CAP)).min(EXPANSION_CAP);
                atom = false;
            }
            b']' | b'}' => return false,
            b'|' => {
                atom = false;
                i += 1;
            }
            b'^' | b'$' => {
                atom = false;
                add(&mut sizes, 1);
                i += 1;
            }
            _ => {
                item = Some(1);
                i += 1;
            }
        }
        if let Some(n) = item {
            atom = true;
            last = n;
            before = sizes[sizes.len() - 1];
            add(&mut sizes, n);
        }
    }
    sizes.len() == 1 && sizes[0] <= MAX_PATTERN_EXPANSION
}

/// ReDoS-safe `pattern.test(value)`. Returns `false` when the value leaves
/// printable ASCII, or when a safe, valid pattern definitively does not
/// match. Returns `true` (satisfied) when the pattern matches, when it is
/// unsafe to run, when it is not a valid regex, or when the input is
/// over-long. Mirror of `safeRegexTest` in `sdk/src/clauses/safeRegex.ts`.
/// The pattern was compiled once, when its spec parsed
/// (`compile_pattern`); a pattern that does not compile never parses.
fn safe_regex_test(pattern: &regex::bytes::Regex, value: &str) -> bool {
    if !is_printable_ascii(value) {
        return false;
    }
    if utf16_len(value) > MAX_PATTERN_TEST_INPUT {
        return true;
    }
    if is_potentially_catastrophic_regex(pattern.as_str()) {
        return true;
    }
    pattern.is_match(value.as_bytes())
}

/// Compiles a portable pattern, once, when its spec parses.
///
/// Unicode mode is off. A patterned value is printable ASCII, and on it
/// the ASCII readings of `\d \w \s \b`, `.` and a negated class match what
/// the Unicode readings match, and what JavaScript's read. The Unicode
/// tables only grow the automaton: a Unicode `\w` compiles to some fifty
/// thousand bytes, so a pattern under `MAX_PATTERN_EXPANSION` could pass the
/// crate's size limit and be refused here while the SDK accepts it. With
/// the tables off, every portable pattern compiles. Without Unicode a
/// pattern may match bytes that are not UTF-8, which only the bytes regex
/// permits; the value it is run on is printable ASCII.
pub(crate) fn compile_pattern(pattern: &str) -> Option<regex::bytes::Regex> {
    regex::bytes::RegexBuilder::new(pattern)
        .unicode(false)
        .build()
        .ok()
}

fn validate_string(
    value: &Value,
    spec: &StringFieldSpec,
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    let s = match value.as_str() {
        Some(s) => s,
        None => {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("expected string, got {}", type_name(value)),
            });
            return;
        }
    };
    if let Some(min_len) = spec.min_length {
        if utf16_len(s) < min_len {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("string shorter than minLength {min_len}"),
            });
        }
    }
    if let Some(max_len) = spec.max_length {
        if utf16_len(s) > max_len {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("string longer than maxLength {max_len}"),
            });
        }
    }
    if let Some(pat) = &spec.pattern {
        // ReDoS-safe, conformance-locked with Layer A (`safeRegexTest` in
        // sdk/src/clauses/safeRegex.ts): screen the catastrophic-backtracking
        // shape and bound the input, treating an unsafe/over-long/invalid
        // pattern as satisfied. Both engines must skip identically or the
        // batch-resolution conformance diverges.
        if !safe_regex_test(pat, s) {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("string does not match pattern {}", pat.as_str()),
            });
        }
    }
    if let Some(fmt) = &spec.format {
        // Only the formats THIS validator knows are enforced; an unknown
        // (permissionlessly-declared) format validates as a plain string —
        // the open format axis (see StringFormat in spec.rs).
        let ok = match fmt {
            StringFormat::Bytes32Hex => is_bytes32_hex(s),
            StringFormat::AddressHex => is_address_hex(s),
            StringFormat::BytesHex => is_bytes_hex(s),
            StringFormat::IsoDatetime => is_iso_datetime(s),
            StringFormat::Other(_) => true,
        };
        if !ok {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("string does not match format {}", format_name(fmt)),
            });
        }
    }
}

fn validate_integer(
    value: &Value,
    spec: &IntegerFieldSpec,
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    // One reading of a JSON number, the spec parser's and the encoder's:
    // `Number.isSafeInteger` over the text. `5.0` and `5e0` are the integer
    // 5 to Layer A, whose JSON.parse keeps no trace of how it was written.
    let n = match value {
        Value::Number(_) => match crate::spec::as_js_integer(value) {
            Some(n) => n,
            None => {
                let message = match value.as_f64() {
                    Some(f) if f.fract() == 0.0 => {
                        format!("value {value} is outside the safe integer range")
                    }
                    _ => format!("expected integer, got {}", type_name(value)),
                };
                errors.push(ValidationError {
                    path: path.to_string(),
                    message,
                });
                return;
            }
        },
        _ => {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("expected integer, got {}", type_name(value)),
            });
            return;
        }
    };
    if let Some(min) = spec.min {
        if n < min {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("value {n} is below min {min}"),
            });
        }
    }
    if let Some(max) = spec.max {
        if n > max {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("value {n} is above max {max}"),
            });
        }
    }
}

/// The largest value a `bigint` field carries: its ABI word is uint256.
const UINT256_MAX: &str =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";

fn strip_sign(s: &str) -> (bool, &str) {
    if let Some(rest) = s.strip_prefix('-') {
        (true, rest)
    } else if let Some(rest) = s.strip_prefix('+') {
        (false, rest)
    } else {
        (false, s)
    }
}

fn strip_leading_zeros(s: &str) -> &str {
    let mut i = 0;
    while i + 1 < s.len() && s.as_bytes()[i] == b'0' {
        i += 1;
    }
    &s[i..]
}

/// Compare two decimal-string integers (possibly signed). Returns
/// Less / Equal / Greater. Both inputs must satisfy
/// `looks_like_decimal_integer`.
fn cmp_decimal(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let (a_neg, a_digits) = strip_sign(a);
    let (b_neg, b_digits) = strip_sign(b);
    let a_d = strip_leading_zeros(a_digits);
    let b_d = strip_leading_zeros(b_digits);
    // Handle "0" == "-0".
    let a_is_zero = a_d == "0";
    let b_is_zero = b_d == "0";
    let a_n = a_neg && !a_is_zero;
    let b_n = b_neg && !b_is_zero;
    match (a_n, b_n) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        (false, false) => match a_d.len().cmp(&b_d.len()) {
            Ordering::Equal => a_d.cmp(b_d),
            ord => ord,
        },
        (true, true) => match a_d.len().cmp(&b_d.len()) {
            Ordering::Equal => b_d.cmp(a_d),
            Ordering::Less => Ordering::Greater,
            Ordering::Greater => Ordering::Less,
        },
    }
}

fn validate_bigint(
    value: &Value,
    spec: &BigintFieldSpec,
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    let s = match value.as_str() {
        Some(s) => s,
        None => {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!(
                    "expected bigint as decimal string, got {}",
                    type_name(value)
                ),
            });
            return;
        }
    };
    if !looks_like_decimal_integer(s) {
        errors.push(ValidationError {
            path: path.to_string(),
            message: format!("value \"{s}\" does not parse as BigInt"),
        });
        return;
    }
    // The field's ABI word is uint256: a signed value or one past the word
    // validates nowhere, because it encodes nowhere — Layer A's rule.
    if s.starts_with('-') || cmp_decimal(s, UINT256_MAX) == std::cmp::Ordering::Greater {
        errors.push(ValidationError {
            path: path.to_string(),
            message: format!("value {s} is outside the uint256 range"),
        });
        return;
    }
    if let Some(min) = &spec.min {
        if cmp_decimal(s, min) == std::cmp::Ordering::Less {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("value {s} is below min {min}"),
            });
        }
    }
    if let Some(max) = &spec.max {
        if cmp_decimal(s, max) == std::cmp::Ordering::Greater {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("value {s} is above max {max}"),
            });
        }
    }
}

fn validate_enum(
    value: &Value,
    spec: &EnumFieldSpec,
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    let s = match value.as_str() {
        Some(s) => s,
        None => {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("expected enum string, got {}", type_name(value)),
            });
            return;
        }
    };
    if !spec.values.iter().any(|v| v == s) {
        let joined = spec.values.join(", ");
        errors.push(ValidationError {
            path: path.to_string(),
            message: format!("value \"{s}\" not in enum [{joined}]"),
        });
    }
}

fn validate_array(
    value: &Value,
    spec: &ArrayFieldSpec,
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    let arr = match value.as_array() {
        Some(a) => a,
        None => {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("expected array, got {}", type_name(value)),
            });
            return;
        }
    };
    if let Some(min_items) = spec.min_items {
        if arr.len() < min_items {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("array shorter than minItems {min_items}"),
            });
        }
    }
    if let Some(max_items) = spec.max_items {
        if arr.len() > max_items {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("array longer than maxItems {max_items}"),
            });
        }
    }
    // An item has no siblings: its format resolves to its static `format`,
    // and the array field's own disposition governs the whole list.
    let item_format = resolve_input_format(&spec.items, &[], None);
    for (i, item) in arr.iter().enumerate() {
        let item_path = format!("{path}[{i}]");
        validate_field(item, &spec.items, &item_path, errors);
        validate_grain(item, item_format, spec.base.disposition, &item_path, errors);
    }
}

fn validate_object(
    value: &Value,
    spec: &ObjectFieldSpec,
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    let obj = match value.as_object() {
        Some(o) => o,
        None => {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("expected object, got {}", type_name(value)),
            });
            return;
        }
    };
    let mut known: std::collections::HashSet<&str> = std::collections::HashSet::new();
    let sibling_defaults = sibling_defaults(&spec.fields);
    for field in &spec.fields {
        let base = field.base();
        known.insert(base.name.as_str());
        let child_path = if path == "$" {
            format!("$.{}", base.name)
        } else {
            format!("{path}.{}", base.name)
        };
        match obj.get(&base.name) {
            None => {
                if base.required {
                    errors.push(ValidationError {
                        path: child_path,
                        message: format!("required field \"{}\" is missing", base.name),
                    });
                }
            }
            Some(child_value) => {
                validate_field(child_value, field, &child_path, errors);
                let resolved = resolve_format_with(field, Some(obj), |name| {
                    sibling_defaults
                        .as_ref()
                        .and_then(|d| d.get(name).copied().flatten())
                });
                validate_grain(child_value, resolved, base.disposition, &child_path, errors);
            }
        }
    }
    // Reject unknown fields — clause is a closed contract.
    for key in obj.keys() {
        if !known.contains(key.as_str()) {
            let child_path = if path == "$" {
                format!("$.{key}")
            } else {
                format!("{path}.{key}")
            };
            errors.push(ValidationError {
                path: child_path,
                message: format!("unknown field \"{key}\" not declared in clause"),
            });
        }
    }
}

/// Resolve a string field's format — the SDK's `resolveInputFormat`: the
/// static `format`, unless the field declares `formatFromField`, in which case
/// the committed value of the named sibling when it is a non-empty string,
/// then that sibling's string default when non-empty, then `format`. It reads
/// only spec-declared names and sibling values, never a clause id.
pub fn resolve_input_format<'a>(
    field: &'a FieldSpec,
    siblings: &'a [FieldSpec],
    values: Option<&'a serde_json::Map<String, Value>>,
) -> Option<&'a str> {
    resolve_format_with(field, values, |name| {
        siblings
            .iter()
            .find(|f| f.base().name == name)
            .and_then(string_default)
    })
}

/// The one resolution behind `resolve_input_format`, with the sibling's
/// default read through `default_of` (the first field of that name, as
/// `find` reads it).
fn resolve_format_with<'a>(
    field: &'a FieldSpec,
    values: Option<&'a serde_json::Map<String, Value>>,
    default_of: impl FnOnce(&str) -> Option<&'a str>,
) -> Option<&'a str> {
    let FieldSpec::String(s) = field else {
        return None;
    };
    let static_format = s.format.as_ref().map(format_name);
    let Some(source) = &s.format_from_field else {
        return static_format;
    };
    if let Some(Value::String(live)) = values.and_then(|v| v.get(source)) {
        if !live.is_empty() {
            return Some(live.as_str());
        }
    }
    default_of(source).or(static_format)
}

/// A field's `default` when it is a non-empty string.
fn string_default(field: &FieldSpec) -> Option<&str> {
    match &field.base().default {
        Some(DefaultValue::String(d)) if !d.is_empty() => Some(d.as_str()),
        _ => None,
    }
}

/// Each name of a field set mapped to its first field's string default,
/// built once per object, so resolving every field's format reads one map
/// in place of a scan of the set per field: n lookups, not n squared
/// comparisons, for a set of n fields. `None` when no field of the set
/// declares `formatFromField`, so a set without one builds nothing.
fn sibling_defaults(fields: &[FieldSpec]) -> Option<HashMap<&str, Option<&str>>> {
    let reads_a_sibling = fields
        .iter()
        .any(|f| matches!(f, FieldSpec::String(s) if s.format_from_field.is_some()));
    if !reads_a_sibling {
        return None;
    }
    let mut defaults: HashMap<&str, Option<&str>> = HashMap::with_capacity(fields.len());
    for f in fields {
        defaults
            .entry(f.base().name.as_str())
            .or_insert_with(|| string_default(f));
    }
    Some(defaults)
}

/// The grain cap — the SDK's `validateGrain` — for each standard `grain.rs`
/// knows: geohash, H3, S2 and Open Location Code. The caller passes the
/// field's resolved format and the disposition that governs the value. When
/// the resolved format is one of those standards, a string that is no code
/// of it, or whose grade is finer than that disposition's cap, is refused;
/// `maxLength` stays the structural ceiling. It keys on the spec's own
/// attributes, never on a clause id or a field name.
fn validate_grain(
    value: &Value,
    resolved_format: Option<&str>,
    disposition: Option<Disposition>,
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
    let (Some(format), Some(s)) = (resolved_format, value.as_str()) else {
        return;
    };
    let (Some(cap), Some(grade)) = (grain_cap_of(format), grain_of(format, s)) else {
        return;
    };
    let allowed = cap_of_disposition(cap, disposition);
    let named = match disposition {
        Some(Disposition::Private) => "private",
        _ => "public",
    };
    let message = match grade {
        None => format!("not a {format} code, so its grain cannot be read"),
        Some(g) if g > allowed && format == GEOHASH_FORMAT => format!(
            "a {named} geohash carries at most {allowed} characters; give the cell's first {allowed} characters"
        ),
        Some(g) if g > allowed => format!(
            "a {named} {format} code carries at most {} {allowed}; this one carries {g}",
            cap.grade
        ),
        Some(_) => return,
    };
    errors.push(ValidationError {
        path: path.to_string(),
        message,
    });
}

fn validate_field(value: &Value, spec: &FieldSpec, path: &str, errors: &mut Vec<ValidationError>) {
    match spec {
        FieldSpec::String(s) => validate_string(value, s, path, errors),
        FieldSpec::Integer(s) => validate_integer(value, s, path, errors),
        FieldSpec::Bigint(s) => validate_bigint(value, s, path, errors),
        FieldSpec::Boolean(_) => {
            if !value.is_boolean() {
                errors.push(ValidationError {
                    path: path.to_string(),
                    message: format!("expected boolean, got {}", type_name(value)),
                });
            }
        }
        FieldSpec::Enum(s) => validate_enum(value, s, path, errors),
        FieldSpec::Array(s) => validate_array(value, s, path, errors),
        FieldSpec::Object(s) => validate_object(value, s, path, errors),
    }
}

fn type_name(v: &Value) -> &'static str {
    // Matches the JavaScript `typeof` token Layer A surfaces in its error
    // messages, so error strings are byte-for-byte identical.
    match v {
        Value::Null => "object",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "object",
        Value::Object(_) => "object",
    }
}

fn format_name(f: &StringFormat) -> &str {
    match f {
        StringFormat::Bytes32Hex => "bytes32-hex",
        StringFormat::AddressHex => "address-hex",
        StringFormat::BytesHex => "bytes-hex",
        StringFormat::IsoDatetime => "iso-datetime",
        StringFormat::Other(s) => s.as_str(),
    }
}

/// Validate `content` against `spec`. If `options.stage` is set and the
/// spec defines a matching stage override, those fields are used;
/// otherwise the spec's default `fields` apply.
pub fn validate_content(
    content: &Value,
    spec: &ClauseSpec,
    options: ValidateOptions,
) -> ValidationResult {
    let fields: &[FieldSpec] = match options.stage {
        Some(stage) => match spec.stages.as_ref().and_then(|m| m.get(&stage)) {
            Some(stage_fields) => stage_fields,
            None => &spec.fields,
        },
        None => &spec.fields,
    };
    let mut errors: Vec<ValidationError> = Vec::new();
    let root_spec = ObjectFieldSpec {
        base: crate::spec::BaseFieldSpec {
            name: "$".to_string(),
            required: true,
            description: None,
            label: None,
            default: None,
            disposition: None,
            blinding: false,
        },
        fields: fields.to_vec(),
    };
    validate_object(content, &root_spec, "$", &mut errors);
    if errors.is_empty() {
        ValidationResult::Ok
    } else {
        ValidationResult::Err(errors)
    }
}

/// Validate the content the parties SIGN for a clause: the content
/// committed under the `checkoutHash`. A spec that declares `emptyAnchor`
/// signs the empty anchor `{}` and nothing else; every other spec's signed
/// content, `{}` included, validates over its top-level `fields`
/// (`validate_content` with no stage). The rule reads the spec's top
/// level, never its `block`. the SDK's `validateSignedContent`.
pub fn validate_signed_content(content: &Value, spec: &ClauseSpec) -> ValidationResult {
    if !spec.empty_anchor {
        return validate_content(content, spec, ValidateOptions::default());
    }
    if content.as_object().is_some_and(|o| o.is_empty()) {
        ValidationResult::Ok
    } else {
        ValidationResult::Err(vec![ValidationError {
            path: "$".to_string(),
            message: "the spec declares emptyAnchor: its signed content is the empty anchor {}"
                .to_string(),
        }])
    }
}
