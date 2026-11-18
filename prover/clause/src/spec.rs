//! Figaro clause-spec format — closed subset of JSON Schema.
//!
//! Mirrors `sdk/src/clauses/spec.ts` field-for-field. The semantics MUST
//! match Layer A exactly; conformance is locked in by
//! `tests/conformance.rs`.
//!
//! The spec is DATA (a JSON file in `clauses/`, anchored on
//! `ClauseRegistry` → IPFS), never code. The prover receives it as a
//! WITNESS INPUT bound to its on-chain `contentHash` — nothing is
//! compiled in, so a never-seen clause validates in-proof with zero
//! Rust changes (open-world by construction).

use serde_json::Value;

// ── String formats (an OPEN axis, matching Layer A) ──────────────────
//
// The named variants are the formats the validator enforces (and the
// encoder maps to ABI types); `Other` keeps the axis permissionless — a
// clause may declare any format (`"geohash"`, a never-seen one) and every
// consumer degrades gracefully: validation skips the format check (plain
// string), encoding falls to the `string` ABI type. A closed set here
// once hard-failed the first non-standard format — the closed-world
// failure the prover must never reintroduce.

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StringFormat {
    Bytes32Hex,
    AddressHex,
    BytesHex,
    IsoDatetime,
    /// A permissionlessly-declared format this layer does not enforce.
    Other(String),
}

impl StringFormat {
    fn from_str(s: &str) -> Self {
        match s {
            "bytes32-hex" => Self::Bytes32Hex,
            "address-hex" => Self::AddressHex,
            "bytes-hex" => Self::BytesHex,
            "iso-datetime" => Self::IsoDatetime,
            other => Self::Other(other.to_string()),
        }
    }
}

// NOTE: `article` (and the whole `block` slice) is presentation metadata
// the prover never reads — Layer A's parser ignores it and so does this
// one. Articles are an open, network-defined grouping vocabulary; no
// logic here may branch on them.

// ── Field specs ──────────────────────────────────────────────────────

/// A build/UI default (composition metadata). Carried so the parser can
/// mirror Layer A's shape validation; the encoder and validator ignore it.
#[derive(Clone, Debug)]
pub enum DefaultValue {
    String(String),
    Integer(i64),
    Boolean(bool),
    StringArray(Vec<String>),
}

/// Whether a field's committed value is published in the open or only behind
/// its fingerprint — the SDK's `FieldDisposition`. Absent reads as public.
/// The grain cap reads it, and a field set's rules count it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Disposition {
    Public,
    Private,
}

#[derive(Clone, Debug)]
pub struct BaseFieldSpec {
    pub name: String,
    pub required: bool,
    pub description: Option<String>,
    /// Human display label — cosmetic Layer-A metadata; carried for
    /// parse parity only.
    pub label: Option<String>,
    /// Build/UI default — shape-validated at parse (Layer A parity);
    /// the ABI encoder ignores it (absent optional still encodes as the
    /// ABI zero-value).
    pub default: Option<DefaultValue>,
    /// `"public"` or `"private"`; `None` when the spec declares none, which
    /// reads as public.
    pub disposition: Option<Disposition>,
    /// The set's blinding field (`"blinding": true`, the only value the
    /// attribute takes): a top-level `bytes32-hex` string, required,
    /// private, with no default, one per private set
    /// (`parse_clause_spec`). Its value is content like any other field's.
    pub blinding: bool,
}

impl BaseFieldSpec {
    /// Is the field's committed value private? Absent reads as public.
    pub fn is_private(&self) -> bool {
        self.disposition == Some(Disposition::Private)
    }
}

#[derive(Clone, Debug)]
pub struct StringFieldSpec {
    pub base: BaseFieldSpec,
    pub format: Option<StringFormat>,
    /// The name of a sibling field whose committed value is this field's
    /// format: resolved as the sibling's value, then the sibling's default,
    /// then `format` (`validate::resolve_input_format`). The grain cap reads
    /// the resolved format.
    pub format_from_field: Option<String>,
    pub min_length: Option<usize>,
    pub max_length: Option<usize>,
    pub pattern: Option<String>,
}

#[derive(Clone, Debug)]
pub struct IntegerFieldSpec {
    pub base: BaseFieldSpec,
    pub min: Option<i64>,
    pub max: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct BigintFieldSpec {
    pub base: BaseFieldSpec,
    /// Min/max stored as decimal strings — JSON cannot carry arbitrary-precision integers.
    pub min: Option<String>,
    pub max: Option<String>,
}

#[derive(Clone, Debug)]
pub struct BooleanFieldSpec {
    pub base: BaseFieldSpec,
}

#[derive(Clone, Debug)]
pub struct EnumFieldSpec {
    pub base: BaseFieldSpec,
    pub values: Vec<String>,
    /// An enum value reserved as the ABI position-as-index placeholder
    /// (conventionally index 0). Never a valid composition input;
    /// validation still accepts it (Layer A parity — the sentinel gate
    /// is a composition-surface concern, not a content gate).
    pub sentinel: Option<String>,
    /// Per-value display labels — cosmetic; carried for parse parity.
    pub value_labels: Option<Vec<(String, String)>>,
}

#[derive(Clone, Debug)]
pub struct ArrayFieldSpec {
    pub base: BaseFieldSpec,
    pub items: Box<FieldSpec>,
    pub min_items: Option<usize>,
    pub max_items: Option<usize>,
}

#[derive(Clone, Debug)]
pub struct ObjectFieldSpec {
    pub base: BaseFieldSpec,
    pub fields: Vec<FieldSpec>,
}

#[derive(Clone, Debug)]
pub enum FieldSpec {
    String(StringFieldSpec),
    Integer(IntegerFieldSpec),
    Bigint(BigintFieldSpec),
    Boolean(BooleanFieldSpec),
    Enum(EnumFieldSpec),
    Array(ArrayFieldSpec),
    Object(ObjectFieldSpec),
}

impl FieldSpec {
    pub fn base(&self) -> &BaseFieldSpec {
        match self {
            Self::String(s) => &s.base,
            Self::Integer(s) => &s.base,
            Self::Bigint(s) => &s.base,
            Self::Boolean(s) => &s.base,
            Self::Enum(s) => &s.base,
            Self::Array(s) => &s.base,
            Self::Object(s) => &s.base,
        }
    }

    fn base_mut(&mut self) -> &mut BaseFieldSpec {
        match self {
            Self::String(s) => &mut s.base,
            Self::Integer(s) => &mut s.base,
            Self::Bigint(s) => &mut s.base,
            Self::Boolean(s) => &mut s.base,
            Self::Enum(s) => &mut s.base,
            Self::Array(s) => &mut s.base,
            Self::Object(s) => &mut s.base,
        }
    }
}

#[derive(Clone, Debug)]
pub struct ClauseSpec {
    /// The bare human-readable clause name (e.g. `figaro-emissions`) — no
    /// version suffix. Presentation: the clause key is `keccak256` of the
    /// canonical spec without `block`, and nothing keys on this name.
    pub clause_id: String,
    /// Clause version — a separate field, never embedded in `clauseId`;
    /// presentation, like the name.
    pub version: u64,
    pub title: String,
    pub description: String,
    /// Default field shape; applies to all stages unless a stage override is set.
    pub fields: Vec<FieldSpec>,
    /// Optional per-stage overrides, keyed by the on-chain `uint8 stage`
    /// a stage key names (`parse_stage_key`).
    pub stages: Option<std::collections::BTreeMap<u8, Vec<FieldSpec>>>,
    // The `block` slice of the spec JSON (designer/runtime composition
    // metadata) is NOT parsed here — pure presentation, matching Layer A.
    // The clause key covers the canonical document WITHOUT `block`; the
    // witness carries exactly those bytes, and they are hashed as carried.
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpecParseError {
    pub path: String,
    pub message: String,
}

pub enum ParseClauseSpecResult {
    Ok(ClauseSpec),
    Err(Vec<SpecParseError>),
}

/// Max field-spec nesting depth — mirrors Layer A's `MAX_FIELD_DEPTH`.
/// Turns an adversarial thousands-deep spec into a clean parse rejection
/// instead of a stack overflow (which in-circuit would be a prover crash).
pub const MAX_FIELD_DEPTH: u32 = 16;

// ── Helpers ──────────────────────────────────────────────────────────

fn err(errors: &mut Vec<SpecParseError>, path: &str, msg: &str) {
    errors.push(SpecParseError {
        path: path.to_string(),
        message: msg.to_string(),
    });
}

/// `Number.MAX_SAFE_INTEGER`, 2^53 − 1.
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

/// JS `Number.isSafeInteger` semantics over a serde_json number: any JSON
/// number whose value is a whole number inside ±(2^53 − 1). (JSON `1.0` IS
/// the integer 1 to Layer A — JavaScript has no int/float distinction.)
/// Past the safe range Layer A reads a rounded number from the text this
/// engine reads exactly, so neither admits it.
pub(crate) fn as_js_integer(v: &Value) -> Option<i64> {
    let i = match v.as_i64() {
        Some(i) => i,
        None => {
            let f = v.as_f64()?;
            if f.fract() != 0.0 || f.abs() > MAX_SAFE_INTEGER as f64 {
                return None;
            }
            f as i64
        }
    };
    (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&i).then_some(i)
}

/// The tightened bigint grammar: `-?[0-9]+`, no empty string, no `+`
/// sign, no hex/whitespace forms. Layer A enforces the same grammar
/// (`sdk/src/clauses/{spec,validate}.ts`) — the earlier bare `BigInt()`
/// coercion accepted `""`/`"0x10"`/padded whitespace against the spec's
/// declared "decimal string" contract, and was tightened in lockstep
/// with this mirror.
pub(crate) fn looks_like_decimal_integer(s: &str) -> bool {
    let bytes = s.as_bytes();
    let digits = match bytes.first() {
        None => return false,
        Some(b'-') => &bytes[1..],
        _ => bytes,
    };
    !digits.is_empty() && digits.iter().all(|b| b.is_ascii_digit())
}

fn parse_base(raw: &Value, path: &str, errors: &mut Vec<SpecParseError>) -> Option<BaseFieldSpec> {
    let obj = raw.as_object()?;
    let name = match obj.get("name").and_then(Value::as_str) {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => {
            err(errors, &format!("{path}.name"), "field name must be a non-empty string");
            return None;
        }
    };
    let required = match obj.get("required").and_then(Value::as_bool) {
        Some(b) => b,
        None => {
            err(errors, &format!("{path}.required"), "required must be a boolean");
            return None;
        }
    };
    let description = match obj.get("description") {
        None => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => {
            err(errors, &format!("{path}.description"), "description must be a string when present");
            return None;
        }
    };
    let label = match obj.get("label") {
        None => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => {
            err(errors, &format!("{path}.label"), "label must be a string when present");
            return None;
        }
    };
    let disposition = match obj.get("disposition") {
        None => None,
        Some(Value::String(s)) if s == "public" => Some(Disposition::Public),
        Some(Value::String(s)) if s == "private" => Some(Disposition::Private),
        Some(_) => {
            err(errors, &format!("{path}.disposition"), "disposition must be \"public\" or \"private\" when present");
            return None;
        }
    };
    let blinding = match obj.get("blinding") {
        None => false,
        Some(Value::Bool(true)) => true,
        Some(_) => {
            err(errors, &format!("{path}.blinding"), "blinding must be true when present");
            return None;
        }
    };
    Some(BaseFieldSpec { name, required, description, label, default: None, disposition, blinding })
}

fn parse_non_negative_usize(
    raw: &Value,
    path: &str,
    field: &str,
    errors: &mut Vec<SpecParseError>,
) -> Option<usize> {
    let n = raw.get(field)?;
    match as_js_integer(n) {
        Some(i) if i >= 0 => Some(i as usize),
        _ => {
            err(
                errors,
                &format!("{path}.{field}"),
                &format!("{field} must be a non-negative integer"),
            );
            None
        }
    }
}

fn parse_i64(raw: &Value, path: &str, field: &str, errors: &mut Vec<SpecParseError>) -> Option<i64> {
    let n = raw.get(field)?;
    match as_js_integer(n) {
        Some(i) => Some(i),
        None => {
            err(errors, &format!("{path}.{field}"), &format!("{field} must be an integer"));
            None
        }
    }
}

fn parse_bigint_bound(
    raw: &Value,
    path: &str,
    field: &str,
    errors: &mut Vec<SpecParseError>,
) -> Option<String> {
    let n = raw.get(field)?;
    let s = match n.as_str() {
        Some(s) => s.to_string(),
        None => {
            err(
                errors,
                &format!("{path}.{field}"),
                &format!("{field} must be a decimal string for bigint"),
            );
            return None;
        }
    };
    if !looks_like_decimal_integer(&s) {
        err(
            errors,
            &format!("{path}.{field}"),
            &format!("{field} must parse as a BigInt"),
        );
        return None;
    }
    Some(s)
}

/// Validate a `default` against its parsed field spec — mirrors Layer A's
/// `defaultMatchesField`. Object fields can't carry defaults; enum (and
/// array-of-enum) defaults must be member values and not the sentinel;
/// numeric defaults respect min/max.
fn default_matches_field(spec: &FieldSpec, value: &Value) -> bool {
    match spec {
        FieldSpec::String(_) => value.is_string(),
        FieldSpec::Integer(s) => match as_js_integer(value) {
            Some(i) => {
                s.min.map(|m| i >= m).unwrap_or(true) && s.max.map(|m| i <= m).unwrap_or(true)
            }
            None => false,
        },
        FieldSpec::Bigint(_) => value
            .as_str()
            .map(looks_like_decimal_integer)
            .unwrap_or(false),
        FieldSpec::Boolean(_) => value.is_boolean(),
        FieldSpec::Enum(e) => match value.as_str() {
            Some(s) => {
                e.values.iter().any(|v| v == s) && e.sentinel.as_deref() != Some(s)
            }
            None => false,
        },
        FieldSpec::Array(a) => match value.as_array() {
            Some(items) => items.iter().all(|v| default_matches_field(&a.items, v)),
            None => false,
        },
        FieldSpec::Object(_) => false,
    }
}

/// Convert a shape-validated default JSON value into the carried form.
fn default_value_of(value: &Value) -> Option<DefaultValue> {
    match value {
        Value::String(s) => Some(DefaultValue::String(s.clone())),
        Value::Bool(b) => Some(DefaultValue::Boolean(*b)),
        Value::Number(_) => as_js_integer(value).map(DefaultValue::Integer),
        Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for item in items {
                out.push(item.as_str()?.to_string());
            }
            Some(DefaultValue::StringArray(out))
        }
        _ => None,
    }
}

/// Parse+validate ONE field spec — mirrors Layer A's exported
/// `parseFieldSpec` (depth gate, core parse, then the default check).
pub fn parse_field_spec(
    raw: &Value,
    path: &str,
    errors: &mut Vec<SpecParseError>,
    depth: u32,
) -> Option<FieldSpec> {
    if depth > MAX_FIELD_DEPTH {
        err(
            errors,
            path,
            &format!("field nesting exceeds the maximum depth of {MAX_FIELD_DEPTH}"),
        );
        return None;
    }
    let mut spec = parse_field_spec_core(raw, path, errors, depth)?;
    if let Some(raw_default) = raw.get("default") {
        if !default_matches_field(&spec, raw_default) {
            err(
                errors,
                &format!("{path}.default"),
                "default must match the field's type/constraints (objects can't carry defaults; enum defaults can't be the sentinel)",
            );
            return None;
        }
        spec.base_mut().default = default_value_of(raw_default);
    }
    // A default of any type marks the field: `default_value_of` carries
    // only the shapes a default may take, and the rule reads the raw key.
    if spec.base().blinding && !blinding_shape_holds(&spec, raw.get("default").is_some(), path, errors, depth) {
        return None;
    }
    Some(spec)
}

/// The format a blinding field carries: 32 bytes as hex, validated and
/// encoded as `bytes32` by both engines.
const BLINDING_FORMAT: &str = "bytes32-hex";

/// The one shape of a blinding field — the SDK's `blindingShapeHolds`: a
/// top-level string of format `bytes32-hex`, required, private, with no
/// default. Pushes one error per broken rule and returns whether all hold.
fn blinding_shape_holds(
    spec: &FieldSpec,
    has_default: bool,
    path: &str,
    errors: &mut Vec<SpecParseError>,
    depth: u32,
) -> bool {
    let before = errors.len();
    if depth > 0 {
        err(
            errors,
            &format!("{path}.blinding"),
            "a blinding field is a top-level field of its set, never nested in an object or an array",
        );
    }
    match spec {
        FieldSpec::String(s) => {
            if s.format != Some(StringFormat::Bytes32Hex) {
                err(errors, &format!("{path}.format"), &format!("a blinding field carries format \"{BLINDING_FORMAT}\""));
            }
        }
        _ => err(errors, &format!("{path}.type"), "a blinding field is of type \"string\""),
    }
    let base = spec.base();
    if !base.required {
        err(errors, &format!("{path}.required"), "a blinding field is required");
    }
    if !base.is_private() {
        err(errors, &format!("{path}.disposition"), "a blinding field is \"private\"");
    }
    if has_default {
        err(
            errors,
            &format!("{path}.default"),
            "a blinding field carries no default: a default is the same in every order, so it blinds nothing",
        );
    }
    errors.len() == before
}

/// Whether a field declares a private value — the SDK's
/// `fieldCarriesPrivate`: its own disposition is `private`, or a field
/// nested in it (an object's `fields`, an array's `items`, at any depth)
/// is. A set is withheld as a whole, so the set rules count the top-level
/// field that holds a nested private field as private.
fn field_carries_private(field: &FieldSpec) -> bool {
    if field.base().is_private() {
        return true;
    }
    match field {
        FieldSpec::Object(o) => o.fields.iter().any(field_carries_private),
        FieldSpec::Array(a) => field_carries_private(&a.items),
        _ => false,
    }
}

/// The rules of one field set (the top-level `fields`, or one `stages[N]`)
/// — the SDK's `fieldSetRulesHold`: the set does not mix public and private
/// fields (a field counts as private when it or a field nested in it is,
/// `field_carries_private`), a set that declares a private field declares exactly one
/// blinding field, and a set with no other private field declares none.
/// The leaf model withholds a whole set, never one field, and a private
/// set's fingerprint without a fresh random value can be confirmed by
/// hashing guesses.
fn field_set_rules_hold(fields: &[FieldSpec], path: &str, errors: &mut Vec<SpecParseError>) {
    if fields.is_empty() {
        return;
    }
    let blinding_count = fields.iter().filter(|f| f.base().blinding).count();
    let private_values = fields
        .iter()
        .filter(|f| field_carries_private(f) && !f.base().blinding)
        .count();
    let any_public = fields.iter().any(|f| !f.base().is_private());
    if any_public && (private_values > 0 || blinding_count > 0) {
        err(
            errors,
            path,
            "a clause may not mix public and private field dispositions — a clause is withheld as a whole; declare private fields in a clause of their own",
        );
    }
    if private_values > 0 && blinding_count != 1 {
        err(
            errors,
            path,
            &format!("a set that declares a private field declares exactly one blinding field (\"blinding\": true); this set declares {blinding_count}"),
        );
    }
    if private_values == 0 && blinding_count > 0 {
        err(
            errors,
            path,
            "a blinding field stands only beside another private field; this set declares no private field",
        );
    }
}

fn parse_field_spec_core(
    raw: &Value,
    path: &str,
    errors: &mut Vec<SpecParseError>,
    depth: u32,
) -> Option<FieldSpec> {
    if !raw.is_object() {
        err(errors, path, "field spec must be an object");
        return None;
    }
    let base = parse_base(raw, path, errors)?;
    let ty = match raw.get("type").and_then(Value::as_str) {
        Some(t) => t,
        None => {
            err(
                errors,
                &format!("{path}.type"),
                "type must be one of: string, integer, bigint, boolean, enum, array, object",
            );
            return None;
        }
    };
    match ty {
        "string" => {
            let mut spec = StringFieldSpec {
                base,
                format: None,
                format_from_field: None,
                min_length: None,
                max_length: None,
                pattern: None,
            };
            if let Some(f) = raw.get("format") {
                // The format AXIS is open: any non-empty string is a valid
                // declaration; only its SHAPE is checked here. Unknown
                // formats validate as plain strings downstream.
                match f.as_str() {
                    Some(s) if !s.is_empty() => spec.format = Some(StringFormat::from_str(s)),
                    _ => {
                        err(errors, &format!("{path}.format"), "format must be a non-empty string");
                        return None;
                    }
                }
            }
            if let Some(f) = raw.get("formatFromField") {
                match f.as_str() {
                    Some(s) if !s.is_empty() => spec.format_from_field = Some(s.to_string()),
                    _ => {
                        err(
                            errors,
                            &format!("{path}.formatFromField"),
                            "formatFromField must be a non-empty string (a sibling field name)",
                        );
                        return None;
                    }
                }
            }
            if raw.get("minLength").is_some() {
                spec.min_length = parse_non_negative_usize(raw, path, "minLength", errors);
                if spec.min_length.is_none() {
                    return None;
                }
            }
            if raw.get("maxLength").is_some() {
                spec.max_length = parse_non_negative_usize(raw, path, "maxLength", errors);
                if spec.max_length.is_none() {
                    return None;
                }
            }
            if let Some(p) = raw.get("pattern") {
                let s = match p.as_str() {
                    Some(s) => s,
                    None => {
                        err(errors, &format!("{path}.pattern"), "pattern must be a string (regex)");
                        return None;
                    }
                };
                if !crate::validate::is_portable_pattern(s) {
                    err(
                        errors,
                        &format!("{path}.pattern"),
                        "pattern must be written in the portable core",
                    );
                    return None;
                }
                if regex::Regex::new(s).is_err() {
                    err(errors, &format!("{path}.pattern"), "pattern must be a valid regex");
                    return None;
                }
                spec.pattern = Some(s.to_string());
            }
            Some(FieldSpec::String(spec))
        }
        "integer" => {
            let mut spec = IntegerFieldSpec { base, min: None, max: None };
            if raw.get("min").is_some() {
                spec.min = parse_i64(raw, path, "min", errors);
                if spec.min.is_none() {
                    return None;
                }
            }
            if raw.get("max").is_some() {
                spec.max = parse_i64(raw, path, "max", errors);
                if spec.max.is_none() {
                    return None;
                }
            }
            Some(FieldSpec::Integer(spec))
        }
        "bigint" => {
            let mut spec = BigintFieldSpec { base, min: None, max: None };
            if raw.get("min").is_some() {
                spec.min = parse_bigint_bound(raw, path, "min", errors);
                if spec.min.is_none() {
                    return None;
                }
            }
            if raw.get("max").is_some() {
                spec.max = parse_bigint_bound(raw, path, "max", errors);
                if spec.max.is_none() {
                    return None;
                }
            }
            Some(FieldSpec::Bigint(spec))
        }
        "boolean" => Some(FieldSpec::Boolean(BooleanFieldSpec { base })),
        "enum" => {
            let arr = match raw.get("values").and_then(Value::as_array) {
                Some(a) if !a.is_empty() => a,
                _ => {
                    err(errors, &format!("{path}.values"), "enum requires a non-empty values array");
                    return None;
                }
            };
            // An enum encodes as uint8, its 0-based position: a spec past
            // 256 values would parse and then fail at its first encoding.
            if arr.len() > 256 {
                err(
                    errors,
                    &format!("{path}.values"),
                    &format!("enum encodes as uint8 — at most 256 values (got {})", arr.len()),
                );
                return None;
            }
            let mut values = Vec::with_capacity(arr.len());
            for (i, v) in arr.iter().enumerate() {
                match v.as_str() {
                    Some(s) => values.push(s.to_string()),
                    None => {
                        err(errors, &format!("{path}.values[{i}]"), "enum values must be strings");
                        return None;
                    }
                }
            }
            let mut spec = EnumFieldSpec { base, values, sentinel: None, value_labels: None };
            if let Some(sentinel) = raw.get("sentinel") {
                match sentinel.as_str() {
                    Some(s) if spec.values.iter().any(|v| v == s) => {
                        spec.sentinel = Some(s.to_string());
                    }
                    _ => {
                        err(errors, &format!("{path}.sentinel"), "sentinel must be one of the enum values");
                        return None;
                    }
                }
            }
            if let Some(labels_raw) = raw.get("valueLabels") {
                let obj = match labels_raw.as_object() {
                    Some(o) => o,
                    None => {
                        err(
                            errors,
                            &format!("{path}.valueLabels"),
                            "valueLabels must be an object (value → label) when present",
                        );
                        return None;
                    }
                };
                let mut labels = Vec::with_capacity(obj.len());
                for (k, v) in obj {
                    let label = match v.as_str() {
                        Some(s) => s,
                        None => {
                            err(errors, &format!("{path}.valueLabels.{k}"), "valueLabels entries must be strings");
                            return None;
                        }
                    };
                    if !spec.values.iter().any(|val| val == k) {
                        err(errors, &format!("{path}.valueLabels.{k}"), "valueLabels key must be one of the enum values");
                        return None;
                    }
                    labels.push((k.clone(), label.to_string()));
                }
                spec.value_labels = Some(labels);
            }
            Some(FieldSpec::Enum(spec))
        }
        "array" => {
            let items_raw = match raw.get("items") {
                Some(v) if v.is_object() => v,
                _ => {
                    err(errors, &format!("{path}.items"), "array requires an items field spec");
                    return None;
                }
            };
            // Layer A parses `{ ...raw.items, name: "*", required: true }`
            // — the synthetic name/required OVERRIDE whatever the items
            // spec declares (anonymous array-item specs).
            let mut items_obj = items_raw.as_object().cloned().unwrap_or_default();
            items_obj.insert("name".to_string(), Value::String("*".to_string()));
            items_obj.insert("required".to_string(), Value::Bool(true));
            let items_value = Value::Object(items_obj);
            let items = parse_field_spec(&items_value, &format!("{path}.items"), errors, depth + 1)?;
            let mut spec = ArrayFieldSpec {
                base,
                items: Box::new(items),
                min_items: None,
                max_items: None,
            };
            if raw.get("minItems").is_some() {
                spec.min_items = parse_non_negative_usize(raw, path, "minItems", errors);
                if spec.min_items.is_none() {
                    return None;
                }
            }
            if raw.get("maxItems").is_some() {
                spec.max_items = parse_non_negative_usize(raw, path, "maxItems", errors);
                if spec.max_items.is_none() {
                    return None;
                }
            }
            Some(FieldSpec::Array(spec))
        }
        "object" => {
            let arr = match raw.get("fields").and_then(Value::as_array) {
                Some(a) => a,
                None => {
                    err(errors, &format!("{path}.fields"), "object requires a fields array");
                    return None;
                }
            };
            let mut fields = Vec::with_capacity(arr.len());
            for (i, v) in arr.iter().enumerate() {
                if let Some(c) = parse_field_spec(v, &format!("{path}.fields[{i}]"), errors, depth + 1) {
                    fields.push(c);
                }
            }
            Some(FieldSpec::Object(ObjectFieldSpec { base, fields }))
        }
        _ => {
            err(
                errors,
                &format!("{path}.type"),
                "type must be one of: string, integer, bigint, boolean, enum, array, object",
            );
            None
        }
    }
}

/// The stage a `stages` key names, or `None` when the key is not a stage
/// key. A stage key has one spelling: the decimal of the on-chain
/// `uint8 stage`, digits only, with no sign, no leading zero and no
/// whitespace ("0" to "255"). A spec with any other key does not parse.
/// The SDK reads a key by the same rule (`stageOfKey` in
/// `sdk/src/clauses/spec.ts`).
pub fn parse_stage_key(key: &str) -> Option<u8> {
    let bytes = key.as_bytes();
    let digits_only = !bytes.is_empty() && bytes.len() <= 3 && bytes.iter().all(u8::is_ascii_digit);
    if !digits_only || (bytes.len() > 1 && bytes[0] == b'0') {
        return None;
    }
    key.parse::<u8>().ok()
}

/// Parse and validate an unknown JSON value as a `ClauseSpec`. Validates
/// the meta-clause (the structure of the spec itself, not any content).
pub fn parse_clause_spec(raw: &Value) -> ParseClauseSpecResult {
    let mut errors: Vec<SpecParseError> = Vec::new();
    let obj = match raw.as_object() {
        Some(o) => o,
        None => {
            return ParseClauseSpecResult::Err(vec![SpecParseError {
                path: "$".to_string(),
                message: "clause spec must be an object".to_string(),
            }]);
        }
    };

    let clause_id = match obj.get("clauseId").and_then(Value::as_str) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => {
            err(&mut errors, "$.clauseId", "clauseId must be a non-empty string");
            String::new()
        }
    };

    let version = match obj.get("version").and_then(as_js_integer) {
        Some(n) if n >= 0 => n as u64,
        _ => {
            err(&mut errors, "$.version", "version must be a non-negative integer");
            0
        }
    };

    let title = match obj.get("title").and_then(Value::as_str) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => {
            err(&mut errors, "$.title", "title must be a non-empty string");
            String::new()
        }
    };

    let description = match obj.get("description") {
        Some(Value::String(s)) => s.clone(),
        _ => {
            err(&mut errors, "$.description", "description must be a string");
            String::new()
        }
    };

    let parsed_fields: Vec<FieldSpec> = match obj.get("fields").and_then(Value::as_array) {
        Some(arr) => {
            let mut out = Vec::with_capacity(arr.len());
            for (i, v) in arr.iter().enumerate() {
                if let Some(c) = parse_field_spec(v, &format!("$.fields[{i}]"), &mut errors, 0) {
                    out.push(c);
                }
            }
            out
        }
        None => {
            err(&mut errors, "$.fields", "fields must be an array");
            Vec::new()
        }
    };
    // A private set carries its one blinding field and never mixes public
    // and private fields; each stage's set is held to the same rules.
    field_set_rules_hold(&parsed_fields, "$.fields", &mut errors);

    let parsed_stages: Option<std::collections::BTreeMap<u8, Vec<FieldSpec>>> =
        match obj.get("stages") {
            None => None,
            Some(stages) => match stages.as_object() {
                None => {
                    err(&mut errors, "$.stages", "stages must be an object keyed by stage number");
                    None
                }
                Some(stage_map) => {
                    let mut out = std::collections::BTreeMap::new();
                    for (key, value) in stage_map {
                        let Some(stage_num) = parse_stage_key(key) else {
                            err(
                                &mut errors,
                                &format!("$.stages.{key}"),
                                "stage key must be the decimal of an integer 0..255: digits only, no sign, no leading zero",
                            );
                            continue;
                        };
                        let arr = match value.as_array() {
                            Some(a) => a,
                            None => {
                                err(
                                    &mut errors,
                                    &format!("$.stages.{key}"),
                                    "stage entry must be a fields array",
                                );
                                continue;
                            }
                        };
                        let mut sf = Vec::with_capacity(arr.len());
                        for (i, v) in arr.iter().enumerate() {
                            if let Some(c) =
                                parse_field_spec(v, &format!("$.stages.{key}[{i}]"), &mut errors, 0)
                            {
                                sf.push(c);
                            }
                        }
                        field_set_rules_hold(&sf, &format!("$.stages.{key}"), &mut errors);
                        out.insert(stage_num, sf);
                    }
                    Some(out)
                }
            },
        };

    // The `block` slice is presentation metadata this layer does not own —
    // ignored, matching Layer A.

    if !errors.is_empty() {
        return ParseClauseSpecResult::Err(errors);
    }

    ParseClauseSpecResult::Ok(ClauseSpec {
        clause_id,
        version,
        title,
        description,
        fields: parsed_fields,
        stages: parsed_stages,
    })
}
