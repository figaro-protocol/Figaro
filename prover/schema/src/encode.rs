//! Generic spec-driven content encoder — Rust mirror of
//! `sdk/src/schemas/encode.ts`. Given a parsed `SchemaSpec` and a JSON
//! content object, derives the canonical ABI bytes deterministically.
//! Output is byte-for-byte identical to viem's `encodeAbiParameters`.
//!
//! This is the cross-form binding the kernel uses inside the SP1 proof:
//! given a JSON content object, the kernel derives `content_bytes`
//! deterministically and asserts `keccak256(content_bytes) == content_ref`.
//! That makes "some bytes hash to content_ref" and "some JSON validates"
//! impossible to forge apart — the bytes are derived from the JSON, so
//! they describe the same content by construction.
//!
//! Canonical encoding rule (see docs/v5/SCALING_STRATEGY.md "Keystone
//! Design — Canonical ABI Mapping"):
//!
//! - Top-level fields encode as `abi_encode_params` in declaration order.
//! - `boolean`  → `bool`
//! - `integer`/`bigint` → `uint256` (width is encode-irrelevant; every
//!   value pads to a 32-byte word)
//! - `enum`     → `uint8`, value = 0-based position in `EnumFieldSpec::values`
//! - `string` (no format) → `string`
//! - `string` (`bytes32-hex`) → `bytes32`
//! - `string` (`address-hex`) → `address`
//! - `string` (`bytes-hex`) → `bytes`
//! - `array<T>` → `T[]` (element type mapped recursively)
//! - `object`   → `tuple(...)` of its fields, declaration order
//!
//! Absent optional fields encode as the ABI zero-value of their type
//! (`0`, `""`, `false`, empty array, zero-bytes). A required absent
//! field is a validation error, surfaced here as `FieldError`.
//!
//! The 17 protocol schemas all encode through this single path; there
//! is no per-schema dispatch. The previous per-schema encoder family
//! (`encode_content_for_schema` + 12 `encode_xxx` functions) was deleted
//! in the keystone cutover — see `git log -- prover/schema/src/encode.rs`
//! for the prior shape.

use alloy_dyn_abi::DynSolValue;
use alloy_primitives::{Address, B256, U256};
use serde_json::Value;

use crate::spec::{FieldSpec, SchemaSpec, StringFieldSpec, StringFormat};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EncodeError {
    /// A field could not be encoded. Carries the runtime field name —
    /// the generic encoder only has names parsed from the spec at runtime.
    FieldError {
        field: String,
        reason: String,
    },
}

impl core::fmt::Display for EncodeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::FieldError { field, reason } => write!(f, "field {field}: {reason}"),
        }
    }
}

impl std::error::Error for EncodeError {}

// ── Generic spec-driven encoder ──────────────────────────────────────

fn field_err(field: &str, reason: impl Into<String>) -> EncodeError {
    EncodeError::FieldError {
        field: field.to_string(),
        reason: reason.into(),
    }
}

/// Parse a numeric field value to `U256`, accepting either a JSON number
/// or a decimal string (the form used for values outside JSON's safe
/// integer range).
fn parse_numeric(name: &str, v: &Value) -> Result<U256, EncodeError> {
    if let Some(n) = v.as_u64() {
        return Ok(U256::from(n));
    }
    if let Some(s) = v.as_str() {
        return U256::from_str_radix(s, 10)
            .map_err(|e| field_err(name, format!("invalid integer: {e}")));
    }
    Err(field_err(
        name,
        "expected an integer (JSON number or decimal string)",
    ))
}

/// Encode a JSON content payload to canonical ABI bytes from a parsed
/// `SchemaSpec`. This is the only encoder; callers that have the
/// schemaId string but not the parsed spec should look up the embedded
/// JSON via `embedded_spec_json_by_key` (or `embedded_spec_json` by
/// hash) and parse with `crate::spec::parse_schema_spec`.
pub fn encode_content_from_spec(
    spec: &SchemaSpec,
    content: &Value,
) -> Result<Vec<u8>, EncodeError> {
    let mut values = Vec::with_capacity(spec.fields.len());
    for field in &spec.fields {
        values.push(encode_field(field, content.get(field.base().name.as_str()))?);
    }
    Ok(DynSolValue::Tuple(values).abi_encode_params())
}

/// Encode one field given its raw JSON value (or absence). A required
/// absent field is an error; an optional absent field is the ABI
/// zero-value of its type.
fn encode_field(field: &FieldSpec, raw: Option<&Value>) -> Result<DynSolValue, EncodeError> {
    match raw.filter(|v| !v.is_null()) {
        None => {
            if field.base().required {
                return Err(field_err(&field.base().name, "required field is absent"));
            }
            Ok(zero_value(field))
        }
        Some(v) => encode_present(field, v),
    }
}

fn encode_present(field: &FieldSpec, v: &Value) -> Result<DynSolValue, EncodeError> {
    let name = field.base().name.as_str();
    match field {
        FieldSpec::Boolean(_) => Ok(DynSolValue::Bool(
            v.as_bool().ok_or_else(|| field_err(name, "expected boolean"))?,
        )),
        // Encoding does not distinguish `integer` from `bigint` — both
        // are a 32-byte ABI word; only validation enforces the range
        // difference. Content may arrive as a JSON number or, for values
        // outside JSON's safe integer range, a decimal string.
        FieldSpec::Integer(_) | FieldSpec::Bigint(_) => {
            Ok(DynSolValue::Uint(parse_numeric(name, v)?, 256))
        }
        FieldSpec::Enum(e) => {
            let s = v
                .as_str()
                .ok_or_else(|| field_err(name, "expected an enum string"))?;
            let idx = e
                .values
                .iter()
                .position(|val| val == s)
                .ok_or_else(|| field_err(name, format!("\"{s}\" is not a declared enum value")))?;
            Ok(DynSolValue::Uint(U256::from(idx), 8))
        }
        FieldSpec::String(s) => encode_string_field(name, s, v),
        FieldSpec::Array(a) => {
            let arr = v
                .as_array()
                .ok_or_else(|| field_err(name, "expected an array"))?;
            let mut out = Vec::with_capacity(arr.len());
            for item in arr {
                out.push(encode_present(&a.items, item)?);
            }
            Ok(DynSolValue::Array(out))
        }
        FieldSpec::Object(o) => {
            let mut out = Vec::with_capacity(o.fields.len());
            for sub in &o.fields {
                out.push(encode_field(sub, v.get(sub.base().name.as_str()))?);
            }
            Ok(DynSolValue::Tuple(out))
        }
    }
}

fn encode_string_field(
    name: &str,
    spec: &StringFieldSpec,
    v: &Value,
) -> Result<DynSolValue, EncodeError> {
    let text = v
        .as_str()
        .ok_or_else(|| field_err(name, "expected a string"))?;
    match spec.format {
        None | Some(StringFormat::IsoDatetime) => Ok(DynSolValue::String(text.to_string())),
        Some(StringFormat::Bytes32Hex) => Ok(DynSolValue::FixedBytes(
            parse_bytes32(name, text)?,
            32,
        )),
        Some(StringFormat::AddressHex) => Ok(DynSolValue::Address(
            parse_address(name, text)?,
        )),
        Some(StringFormat::BytesHex) => Ok(DynSolValue::Bytes(parse_bytes(name, text)?)),
    }
}

/// The ABI zero-value for an absent optional field, by type.
fn zero_value(field: &FieldSpec) -> DynSolValue {
    match field {
        FieldSpec::Boolean(_) => DynSolValue::Bool(false),
        FieldSpec::Integer(_) | FieldSpec::Bigint(_) => DynSolValue::Uint(U256::ZERO, 256),
        FieldSpec::Enum(_) => DynSolValue::Uint(U256::ZERO, 8),
        FieldSpec::String(s) => match s.format {
            None | Some(StringFormat::IsoDatetime) => DynSolValue::String(String::new()),
            Some(StringFormat::Bytes32Hex) => DynSolValue::FixedBytes(B256::ZERO, 32),
            Some(StringFormat::AddressHex) => DynSolValue::Address(Address::ZERO),
            Some(StringFormat::BytesHex) => DynSolValue::Bytes(Vec::new()),
        },
        FieldSpec::Array(_) => DynSolValue::Array(Vec::new()),
        FieldSpec::Object(o) => DynSolValue::Tuple(o.fields.iter().map(zero_value).collect()),
    }
}

// ── Hex parsing helpers ──────────────────────────────────────────────

fn parse_bytes32(name: &str, s: &str) -> Result<B256, EncodeError> {
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    let bytes = alloy_primitives::hex::decode(stripped)
        .map_err(|e| field_err(name, format!("malformed bytes32 hex: {e}")))?;
    if bytes.len() != 32 {
        return Err(field_err(
            name,
            format!("malformed bytes32 hex: expected 32 bytes, got {}", bytes.len()),
        ));
    }
    Ok(B256::from_slice(&bytes))
}

fn parse_bytes(name: &str, s: &str) -> Result<Vec<u8>, EncodeError> {
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    alloy_primitives::hex::decode(stripped)
        .map_err(|e| field_err(name, format!("malformed bytes hex: {e}")))
}

fn parse_address(name: &str, s: &str) -> Result<Address, EncodeError> {
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    let bytes = alloy_primitives::hex::decode(stripped)
        .map_err(|e| field_err(name, format!("malformed address hex: {e}")))?;
    if bytes.len() != 20 {
        return Err(field_err(
            name,
            format!("malformed address hex: expected 20 bytes, got {}", bytes.len()),
        ));
    }
    Ok(Address::from_slice(&bytes))
}
