//! Figaro clause-spec format — closed subset of JSON Schema.
//!
//! Mirrors `sdk/src/clauses/spec.ts` field-for-field. The semantics MUST
//! match Layer A exactly; conformance is locked in by
//! `tests/conformance.rs`.

use serde_json::Value;

// ── Enumerations (closed sets, matching Layer A) ─────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StringFormat {
    Bytes32Hex,
    AddressHex,
    BytesHex,
    IsoDatetime,
}

impl StringFormat {
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "bytes32-hex" => Some(Self::Bytes32Hex),
            "address-hex" => Some(Self::AddressHex),
            "bytes-hex" => Some(Self::BytesHex),
            "iso-datetime" => Some(Self::IsoDatetime),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClauseTier {
    Runtime,
    CrossChecked,
    AgreementOnly,
}

impl ClauseTier {
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "runtime" => Some(Self::Runtime),
            "cross-checked" => Some(Self::CrossChecked),
            "agreement-only" => Some(Self::AgreementOnly),
            _ => None,
        }
    }
}

// NOTE: `article` is FREE-FORM, matching Layer A. Articles are an open,
// network-defined grouping vocabulary — a registered clause may introduce a
// new article at any time, so the prover must never enumerate them. (A closed
// enum here once hard-failed the first non-standard article — a Layer-B
// permissionlessness hole.) The prover only carries the value; no logic
// branches on it.

// ── Field specs ──────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct BaseFieldSpec {
    pub name: String,
    pub required: bool,
    pub description: Option<String>,
}

#[derive(Clone, Debug)]
pub struct StringFieldSpec {
    pub base: BaseFieldSpec,
    pub format: Option<StringFormat>,
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
}

#[derive(Clone, Debug)]
pub struct ClauseBlockBinding {
    pub tier: ClauseTier,
    pub article: Option<String>,
    pub mechanism_kinds: Vec<String>,
    pub module_ids: Vec<String>,
    pub routes: Option<Vec<String>>,
    pub sister_clause_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ClauseSpec {
    pub clause_id: String,
    pub version: u32,
    pub title: String,
    pub description: String,
    pub categories: Option<Vec<String>>,
    pub fields: Vec<FieldSpec>,
    pub stages: Option<std::collections::BTreeMap<u8, Vec<FieldSpec>>>,
    pub block: Option<ClauseBlockBinding>,
}

impl ClauseSpec {
    /// Whether this clause's agreement `sectionData` is the
    /// cross-checking ABI content form — true exactly when the block tier
    /// is `cross-checked`. For a cross-checked declarative clause the committed
    /// `sectionData` and the runtime attestation content are byte-identical,
    /// so the agreement Merkle leaf collapses to `keccak256(clauseId ++
    /// content_ref)`. `runtime` (runtime-only) clauses — and any spec with
    /// no block binding — are not cross-checking: their leaf is derived
    /// from the canonical-JSON `sectionData` carried in the content proof.
    ///
    /// This is the single source of truth for the kernel's Gate 5
    /// (agreement inclusion); the tier travels in the embedded spec JSON,
    /// so no parallel table can drift from it.
    pub fn cross_checks(&self) -> bool {
        matches!(
            self.block.as_ref().map(|b| b.tier),
            Some(ClauseTier::CrossChecked)
        )
    }
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

// ── Helpers ──────────────────────────────────────────────────────────

fn is_object(v: &Value) -> bool {
    v.is_object()
}

fn err(errors: &mut Vec<SpecParseError>, path: &str, msg: &str) {
    errors.push(SpecParseError {
        path: path.to_string(),
        message: msg.to_string(),
    });
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
    Some(BaseFieldSpec { name, required, description })
}

fn parse_non_negative_usize(
    raw: &Value,
    path: &str,
    field: &str,
    errors: &mut Vec<SpecParseError>,
) -> Option<usize> {
    let n = raw.get(field)?;
    match n.as_u64() {
        Some(u) => Some(u as usize),
        None => {
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
    match n.as_i64() {
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
    // Verify it parses as a (possibly signed) decimal bigint.
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

pub(crate) fn looks_like_decimal_integer(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    let bytes = s.as_bytes();
    let mut i = 0;
    if bytes[0] == b'-' || bytes[0] == b'+' {
        i = 1;
        if bytes.len() == 1 {
            return false;
        }
    }
    while i < bytes.len() {
        if !bytes[i].is_ascii_digit() {
            return false;
        }
        i += 1;
    }
    true
}

fn parse_string_array(
    raw: &Value,
    path: &str,
    errors: &mut Vec<SpecParseError>,
) -> Option<Vec<String>> {
    let arr = match raw.as_array() {
        Some(a) => a,
        None => {
            err(errors, path, "expected an array of strings");
            return None;
        }
    };
    let mut out = Vec::with_capacity(arr.len());
    for (i, v) in arr.iter().enumerate() {
        match v.as_str() {
            Some(s) if !s.is_empty() => out.push(s.to_string()),
            _ => {
                err(errors, &format!("{path}[{i}]"), "expected a non-empty string");
                return None;
            }
        }
    }
    Some(out)
}

fn parse_field_spec(raw: &Value, path: &str, errors: &mut Vec<SpecParseError>) -> Option<FieldSpec> {
    if !is_object(raw) {
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
                min_length: None,
                max_length: None,
                pattern: None,
            };
            if let Some(f) = raw.get("format") {
                match f.as_str().and_then(StringFormat::from_str) {
                    Some(fmt) => spec.format = Some(fmt),
                    None => {
                        err(
                            errors,
                            &format!("{path}.format"),
                            "format must be one of: bytes32-hex, address-hex, bytes-hex, iso-datetime",
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
                    err(
                        errors,
                        &format!("{path}.values"),
                        "enum requires a non-empty values array",
                    );
                    return None;
                }
            };
            let mut values = Vec::with_capacity(arr.len());
            for (i, v) in arr.iter().enumerate() {
                match v.as_str() {
                    Some(s) => values.push(s.to_string()),
                    None => {
                        err(
                            errors,
                            &format!("{path}.values[{i}]"),
                            "enum values must be strings",
                        );
                        return None;
                    }
                }
            }
            Some(FieldSpec::Enum(EnumFieldSpec { base, values }))
        }
        "array" => {
            let items_raw = match raw.get("items") {
                Some(v) if v.is_object() => v,
                _ => {
                    err(
                        errors,
                        &format!("{path}.items"),
                        "array requires an items field spec",
                    );
                    return None;
                }
            };
            // Inject synthetic name + required so the inner parser is happy
            // for anonymous array-item specs (Layer A does the same.)
            let mut items_obj = items_raw.as_object().cloned().unwrap_or_default();
            items_obj
                .entry("name".to_string())
                .or_insert_with(|| Value::String("*".to_string()));
            items_obj
                .entry("required".to_string())
                .or_insert(Value::Bool(true));
            let items_value = Value::Object(items_obj);
            let items = parse_field_spec(&items_value, &format!("{path}.items"), errors)?;
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
                    err(
                        errors,
                        &format!("{path}.fields"),
                        "object requires a fields array",
                    );
                    return None;
                }
            };
            let mut fields = Vec::with_capacity(arr.len());
            for (i, v) in arr.iter().enumerate() {
                if let Some(c) = parse_field_spec(v, &format!("{path}.fields[{i}]"), errors) {
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

fn parse_block_binding(
    raw: &Value,
    path: &str,
    errors: &mut Vec<SpecParseError>,
) -> Option<ClauseBlockBinding> {
    if !is_object(raw) {
        err(errors, path, "block binding must be an object");
        return None;
    }
    let tier = match raw.get("tier").and_then(Value::as_str).and_then(ClauseTier::from_str) {
        Some(t) => t,
        None => {
            err(
                errors,
                &format!("{path}.tier"),
                "tier must be one of: runtime, cross-checked, agreement-only",
            );
            return None;
        }
    };
    let article = match raw.get("article") {
        None => None,
        Some(v) => match v.as_str() {
            Some(s) if !s.is_empty() => Some(s.to_string()),
            _ => {
                err(
                    errors,
                    &format!("{path}.article"),
                    "article must be a non-empty string when present",
                );
                return None;
            }
        },
    };
    // Optional: absent ⇒ []. A clause wiring no mechanism module (a pure
    // attestation lifecycle or any minimal stranger's clause) omits these; the
    // validator and prover ignore them. (Present-but-malformed still errors.)
    let mechanism_kinds = match raw.get("mechanismKinds") {
        Some(v) => parse_string_array(v, &format!("{path}.mechanismKinds"), errors)?,
        None => Vec::new(),
    };
    let module_ids = match raw.get("moduleIds") {
        Some(v) => parse_string_array(v, &format!("{path}.moduleIds"), errors)?,
        None => Vec::new(),
    };
    let routes = match raw.get("routes") {
        None => None,
        Some(v) => Some(parse_string_array(v, &format!("{path}.routes"), errors)?),
    };
    let sister_clause_id = match raw.get("sisterClauseId") {
        None => None,
        Some(v) => match v.as_str() {
            Some(s) if !s.is_empty() => Some(s.to_string()),
            _ => {
                err(
                    errors,
                    &format!("{path}.sisterClauseId"),
                    "sisterClauseId must be a non-empty string when present",
                );
                return None;
            }
        },
    };
    Some(ClauseBlockBinding {
        tier,
        article,
        mechanism_kinds,
        module_ids,
        routes,
        sister_clause_id,
    })
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

    let version = match obj.get("version").and_then(Value::as_u64) {
        Some(n) if n <= u32::MAX as u64 => n as u32,
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

    let categories = match obj.get("categories") {
        None => None,
        Some(v) => match v.as_array() {
            None => {
                err(
                    &mut errors,
                    "$.categories",
                    "categories must be an array of strings",
                );
                None
            }
            Some(arr) => {
                let mut out = Vec::with_capacity(arr.len());
                let mut bad = false;
                for (i, c) in arr.iter().enumerate() {
                    match c.as_str() {
                        Some(s) if !s.is_empty() => out.push(s.to_string()),
                        _ => {
                            err(
                                &mut errors,
                                &format!("$.categories[{i}]"),
                                "category must be a non-empty string",
                            );
                            bad = true;
                            break;
                        }
                    }
                }
                if bad {
                    None
                } else {
                    Some(out)
                }
            }
        },
    };

    let parsed_fields: Vec<FieldSpec> = match obj.get("fields").and_then(Value::as_array) {
        Some(arr) => {
            let mut out = Vec::with_capacity(arr.len());
            for (i, v) in arr.iter().enumerate() {
                if let Some(c) = parse_field_spec(v, &format!("$.fields[{i}]"), &mut errors) {
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

    let parsed_stages: Option<std::collections::BTreeMap<u8, Vec<FieldSpec>>> =
        match obj.get("stages") {
            None => None,
            Some(stages) => match stages.as_object() {
                None => {
                    err(
                        &mut errors,
                        "$.stages",
                        "stages must be an object keyed by stage number",
                    );
                    None
                }
                Some(stage_map) => {
                    let mut out = std::collections::BTreeMap::new();
                    for (key, value) in stage_map {
                        let stage_num: u32 = match key.parse() {
                            Ok(n) if n <= 255 => n,
                            _ => {
                                err(
                                    &mut errors,
                                    &format!("$.stages.{key}"),
                                    "stage key must be an integer 0..255",
                                );
                                continue;
                            }
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
                                parse_field_spec(v, &format!("$.stages.{key}[{i}]"), &mut errors)
                            {
                                sf.push(c);
                            }
                        }
                        out.insert(stage_num as u8, sf);
                    }
                    Some(out)
                }
            },
        };

    let parsed_block = match obj.get("block") {
        None => None,
        Some(b) => parse_block_binding(b, "$.block", &mut errors),
    };

    if !errors.is_empty() {
        return ParseClauseSpecResult::Err(errors);
    }

    ParseClauseSpecResult::Ok(ClauseSpec {
        clause_id,
        version,
        title,
        description,
        categories,
        fields: parsed_fields,
        stages: parsed_stages,
        block: parsed_block,
    })
}
