//! Figaro schema-spec format — closed subset of JSON Schema.
//!
//! Mirrors `sdk/src/schemas/spec.ts` field-for-field. The semantics MUST
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
pub enum SchemaTier {
    Category1,
    Category2,
    ManifestOnly,
}

impl SchemaTier {
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "category-1" => Some(Self::Category1),
            "category-2" => Some(Self::Category2),
            "manifest-only" => Some(Self::ManifestOnly),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SchemaDrawerArticle {
    Identity,
    Order,
    Fulfilment,
    Logistics,
    Attestations,
    Emissions,
    Jurisdiction,
    Consent,
}

impl SchemaDrawerArticle {
    fn from_str(s: &str) -> Option<Self> {
        match s {
            "identity" => Some(Self::Identity),
            "order" => Some(Self::Order),
            "fulfilment" => Some(Self::Fulfilment),
            "logistics" => Some(Self::Logistics),
            "attestations" => Some(Self::Attestations),
            "emissions" => Some(Self::Emissions),
            "jurisdiction" => Some(Self::Jurisdiction),
            "consent" => Some(Self::Consent),
            _ => None,
        }
    }
}

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
pub struct SchemaBlockBinding {
    pub tier: SchemaTier,
    pub drawer_article: Option<SchemaDrawerArticle>,
    pub mechanism_kinds: Vec<String>,
    pub module_ids: Vec<String>,
    pub routes: Option<Vec<String>>,
    pub sister_schema_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct SchemaSpec {
    pub schema_id: String,
    pub version: u32,
    pub title: String,
    pub description: String,
    pub categories: Option<Vec<String>>,
    pub fields: Vec<FieldSpec>,
    pub stages: Option<std::collections::BTreeMap<u8, Vec<FieldSpec>>>,
    pub block: Option<SchemaBlockBinding>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SpecParseError {
    pub path: String,
    pub message: String,
}

pub enum ParseSchemaSpecResult {
    Ok(SchemaSpec),
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
) -> Option<SchemaBlockBinding> {
    if !is_object(raw) {
        err(errors, path, "block binding must be an object");
        return None;
    }
    let tier = match raw.get("tier").and_then(Value::as_str).and_then(SchemaTier::from_str) {
        Some(t) => t,
        None => {
            err(
                errors,
                &format!("{path}.tier"),
                "tier must be one of: category-1, category-2, manifest-only",
            );
            return None;
        }
    };
    let drawer_article = match raw.get("drawerArticle") {
        None => None,
        Some(v) => match v.as_str().and_then(SchemaDrawerArticle::from_str) {
            Some(d) => Some(d),
            None => {
                err(
                    errors,
                    &format!("{path}.drawerArticle"),
                    "drawerArticle must be one of: identity, order, fulfilment, logistics, attestations, emissions, jurisdiction, consent",
                );
                return None;
            }
        },
    };
    let mechanism_kinds = match raw.get("mechanismKinds") {
        Some(v) => parse_string_array(v, &format!("{path}.mechanismKinds"), errors)?,
        None => {
            err(errors, &format!("{path}.mechanismKinds"), "expected an array of strings");
            return None;
        }
    };
    let module_ids = match raw.get("moduleIds") {
        Some(v) => parse_string_array(v, &format!("{path}.moduleIds"), errors)?,
        None => {
            err(errors, &format!("{path}.moduleIds"), "expected an array of strings");
            return None;
        }
    };
    let routes = match raw.get("routes") {
        None => None,
        Some(v) => Some(parse_string_array(v, &format!("{path}.routes"), errors)?),
    };
    let sister_schema_id = match raw.get("sisterSchemaId") {
        None => None,
        Some(v) => match v.as_str() {
            Some(s) if !s.is_empty() => Some(s.to_string()),
            _ => {
                err(
                    errors,
                    &format!("{path}.sisterSchemaId"),
                    "sisterSchemaId must be a non-empty string when present",
                );
                return None;
            }
        },
    };
    Some(SchemaBlockBinding {
        tier,
        drawer_article,
        mechanism_kinds,
        module_ids,
        routes,
        sister_schema_id,
    })
}

/// Parse and validate an unknown JSON value as a `SchemaSpec`. Validates
/// the meta-schema (the structure of the spec itself, not any content).
pub fn parse_schema_spec(raw: &Value) -> ParseSchemaSpecResult {
    let mut errors: Vec<SpecParseError> = Vec::new();
    let obj = match raw.as_object() {
        Some(o) => o,
        None => {
            return ParseSchemaSpecResult::Err(vec![SpecParseError {
                path: "$".to_string(),
                message: "schema spec must be an object".to_string(),
            }]);
        }
    };

    let schema_id = match obj.get("schemaId").and_then(Value::as_str) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => {
            err(&mut errors, "$.schemaId", "schemaId must be a non-empty string");
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
        return ParseSchemaSpecResult::Err(errors);
    }

    ParseSchemaSpecResult::Ok(SchemaSpec {
        schema_id,
        version,
        title,
        description,
        categories,
        fields: parsed_fields,
        stages: parsed_stages,
        block: parsed_block,
    })
}
