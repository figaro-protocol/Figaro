//! Content validator — validates a JSON content value against a parsed
//! `ClauseSpec`. Rust mirror of `sdk/src/clauses/validate.ts`.
//!
//! Call sites: SP1 zkVM prover (where the clause validator runs inside the
//! proof), off-chain sequencer (where it runs before submitting a batch),
//! and any Rust SDK consumer.

use serde_json::Value;

use crate::spec::{
    looks_like_decimal_integer, ArrayFieldSpec, BigintFieldSpec, EnumFieldSpec, FieldSpec,
    IntegerFieldSpec, ObjectFieldSpec, ClauseSpec, StringFieldSpec, StringFormat,
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
    s.len() == 66
        && s.starts_with("0x")
        && s.as_bytes()[2..].iter().all(|b| b.is_ascii_hexdigit())
}

fn is_address_hex(s: &str) -> bool {
    s.len() == 42
        && s.starts_with("0x")
        && s.as_bytes()[2..].iter().all(|b| b.is_ascii_hexdigit())
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
    if !digits_at(0, 4) || bytes[4] != b'-' || !digits_at(5, 2) || bytes[7] != b'-'
        || !digits_at(8, 2) || bytes[10] != b'T' || !digits_at(11, 2) || bytes[13] != b':'
        || !digits_at(14, 2) || bytes[16] != b':' || !digits_at(17, 2)
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

/// ReDoS-safe `pattern.test(value)`. Returns `true` (satisfied) when the pattern
/// matches, when it is unsafe to run, when it is not a valid regex, or when the
/// input is over-long. Mirror of `safeRegexTest` in
/// `sdk/src/clauses/safeRegex.ts`.
fn safe_regex_test(pattern: &str, value: &str) -> bool {
    if utf16_len(value) > MAX_PATTERN_TEST_INPUT {
        return true;
    }
    if is_potentially_catastrophic_regex(pattern) {
        return true;
    }
    match regex::Regex::new(pattern) {
        Ok(re) => re.is_match(value),
        Err(_) => true,
    }
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
        // batch-settlement conformance diverges.
        if !safe_regex_test(pat, s) {
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("string does not match pattern {pat}"),
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
    let n = match value.as_i64() {
        Some(n) if value.is_i64() || value.is_u64() => n,
        _ => {
            // Reject floats and non-numbers — Layer A uses Number.isInteger
            // which is false for any non-integer JSON Number, and for any
            // non-Number type entirely.
            errors.push(ValidationError {
                path: path.to_string(),
                message: format!("expected integer, got {}", type_name(value)),
            });
            return;
        }
    };
    // serde_json's `is_i64` already excludes floats with non-zero fractional
    // parts and overly large unsigned integers. Numbers larger than i64::MAX
    // are caught here.
    if value.as_f64().map(|f| f.fract() != 0.0).unwrap_or(false) {
        errors.push(ValidationError {
            path: path.to_string(),
            message: format!("expected integer, got {}", type_name(value)),
        });
        return;
    }
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
    for (i, item) in arr.iter().enumerate() {
        validate_field(item, &spec.items, &format!("{path}[{i}]"), errors);
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

fn validate_field(
    value: &Value,
    spec: &FieldSpec,
    path: &str,
    errors: &mut Vec<ValidationError>,
) {
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
