//! Per-schema content encoders — Rust mirror of
//! `sdk/src/schemas/encode.ts`. For each protocol schemaId, produces the
//! ABI-encoded content bytes the on-chain validator decodes. Output is
//! byte-for-byte identical to viem's `encodeAbiParameters`.
//!
//! This is the cross-form binding the kernel uses inside the SP1 proof:
//! given a JSON content object, the kernel derives `content_bytes`
//! deterministically and asserts `keccak256(content_bytes) == content_ref`.
//! That makes "some bytes hash to content_ref" and "some JSON validates"
//! impossible to forge apart — the bytes are derived from the JSON, so
//! they describe the same content by construction.

use alloy_dyn_abi::DynSolValue;
use alloy_primitives::{Address, B256, U256};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EncodeError {
    /// No encoder registered for this schemaId.
    UnsupportedSchema(String),
    /// JSON value did not have the expected JSON type for this field.
    BadType {
        field: &'static str,
        expected: &'static str,
    },
    /// JSON did not contain a required field.
    MissingField(&'static str),
    /// Enum value did not appear in the schema's index map.
    UnknownEnumValue {
        field: &'static str,
        value: String,
    },
    /// Numeric value did not fit the expected width.
    OutOfRange {
        field: &'static str,
        value: String,
    },
    /// Hex-encoded bytes were malformed.
    BadHex {
        field: &'static str,
        reason: String,
    },
}

impl core::fmt::Display for EncodeError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::UnsupportedSchema(id) => write!(f, "no Rust encoder registered for schemaId \"{id}\""),
            Self::BadType { field, expected } => write!(f, "field {field}: expected {expected}"),
            Self::MissingField(field) => write!(f, "missing required field {field}"),
            Self::UnknownEnumValue { field, value } => {
                write!(f, "field {field}: \"{value}\" is not a known enum value")
            }
            Self::OutOfRange { field, value } => write!(f, "field {field}: value {value} out of range"),
            Self::BadHex { field, reason } => write!(f, "field {field}: bad hex ({reason})"),
        }
    }
}

impl std::error::Error for EncodeError {}

// ── Top-level dispatcher ─────────────────────────────────────────────

/// Encode a JSON content payload to ABI-encoded bytes for the given
/// schemaId. Returns `UnsupportedSchema` if no encoder is registered —
/// the kernel treats this as a hard failure (it cannot validate content
/// for a schema it has no encoder for).
pub fn encode_content_for_schema(schema_id: &str, content: &Value) -> Result<Vec<u8>, EncodeError> {
    match schema_id {
        // GHG family: all five sister schemas share `abi.encode(uint8 scope)`.
        "figaro-ghg-protocol-v1"
        | "figaro-ghg-iso-14064-v1"
        | "figaro-ghg-pas-2050-v1"
        | "figaro-ghg-en-16258-v1"
        | "figaro-ghg-custom-v1" => encode_ghg_scope(content),

        "figaro-ghg-measurement-v1" => encode_ghg_measurement(content),

        "figaro-geo-v2" => encode_geo(content),
        "figaro-fulfilment-v2" => encode_fulfilment(content),
        "figaro-jurisdiction-v1" => encode_jurisdiction(content),
        "figaro-commerce-v1" => encode_commerce(content),
        "figaro-proximity-policy-v1" => encode_proximity_policy(content),
        "figaro-proximity-proof-v1" => encode_proximity_proof(content),
        "figaro-offset-policy-v1" => encode_offset_policy(content),
        "figaro-merchant-process-v1" => encode_merchant_process(content),
        "figaro-courier-process-v1" => encode_courier_process(content),
        "figaro-consent-v1" => encode_consent(content),

        // `figaro-topology-v1` is manifest-only — has no validator, never
        // attested at runtime. No encoder needed.
        _ => Err(EncodeError::UnsupportedSchema(schema_id.to_string())),
    }
}

// ── Helpers ──────────────────────────────────────────────────────────

fn get_field<'a>(content: &'a Value, name: &'static str) -> Result<&'a Value, EncodeError> {
    content
        .get(name)
        .ok_or(EncodeError::MissingField(name))
}

fn opt_field<'a>(content: &'a Value, name: &str) -> Option<&'a Value> {
    content.get(name).filter(|v| !v.is_null())
}

fn as_str<'a>(v: &'a Value, field: &'static str) -> Result<&'a str, EncodeError> {
    v.as_str().ok_or(EncodeError::BadType { field, expected: "string" })
}

fn as_u64(v: &Value, field: &'static str) -> Result<u64, EncodeError> {
    v.as_u64().ok_or(EncodeError::BadType { field, expected: "non-negative integer" })
}

fn as_array<'a>(v: &'a Value, field: &'static str) -> Result<&'a Vec<Value>, EncodeError> {
    v.as_array().ok_or(EncodeError::BadType { field, expected: "array" })
}

fn parse_bytes32(s: &str, field: &'static str) -> Result<B256, EncodeError> {
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    let bytes = alloy_primitives::hex::decode(stripped)
        .map_err(|e| EncodeError::BadHex { field, reason: e.to_string() })?;
    if bytes.len() != 32 {
        return Err(EncodeError::BadHex {
            field,
            reason: format!("expected 32 bytes, got {}", bytes.len()),
        });
    }
    Ok(B256::from_slice(&bytes))
}

fn parse_bytes(s: &str, field: &'static str) -> Result<Vec<u8>, EncodeError> {
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    alloy_primitives::hex::decode(stripped)
        .map_err(|e| EncodeError::BadHex { field, reason: e.to_string() })
}

fn parse_address(s: &str, field: &'static str) -> Result<Address, EncodeError> {
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    let bytes = alloy_primitives::hex::decode(stripped)
        .map_err(|e| EncodeError::BadHex { field, reason: e.to_string() })?;
    if bytes.len() != 20 {
        return Err(EncodeError::BadHex {
            field,
            reason: format!("expected 20 bytes, got {}", bytes.len()),
        });
    }
    Ok(Address::from_slice(&bytes))
}

fn parse_bigint(v: &Value, field: &'static str) -> Result<U256, EncodeError> {
    let s = as_str(v, field)?;
    U256::from_str_radix(s, 10).map_err(|e| EncodeError::OutOfRange {
        field,
        value: format!("{s}: {e}"),
    })
}

fn enum_index(
    field: &'static str,
    value: &str,
    table: &[(&str, u8)],
) -> Result<u8, EncodeError> {
    table
        .iter()
        .find(|(name, _)| *name == value)
        .map(|(_, idx)| *idx)
        .ok_or_else(|| EncodeError::UnknownEnumValue {
            field,
            value: value.to_string(),
        })
}

/// Encode a tuple of named parameters as Solidity `abi.encode(...)`.
/// Equivalent to viem.encodeAbiParameters([types], [values]).
fn encode_params(values: Vec<DynSolValue>) -> Vec<u8> {
    DynSolValue::Tuple(values).abi_encode_params()
}

// ── figaro-ghg-<standard>-v1 family + figaro-ghg-measurement-v1 ──────
//
// All five sister GHG schemas share: `abi.encode(uint8 scope)`.

fn encode_ghg_scope(content: &Value) -> Result<Vec<u8>, EncodeError> {
    // scope is optional (defaults to 0 = unset).
    let scope = match opt_field(content, "scope") {
        Some(v) => {
            let n = as_u64(v, "scope")?;
            if n > 255 {
                return Err(EncodeError::OutOfRange {
                    field: "scope",
                    value: n.to_string(),
                });
            }
            n as u8
        }
        None => 0,
    };
    Ok(encode_params(vec![DynSolValue::Uint(U256::from(scope), 8)]))
}

fn encode_ghg_measurement(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let grams_field = get_field(content, "grams")?;
    let grams = parse_bigint(grams_field, "grams")?;
    Ok(encode_params(vec![DynSolValue::Uint(grams, 256)]))
}

// ── figaro-geo-v2 ────────────────────────────────────────────────────

const CLASS_OF_SERVICE: &[(&str, u8)] = &[
    ("S", 1),
    ("E", 2),
    ("F", 3),
    ("C", 4),
];

fn encode_geo(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let origin = as_str(get_field(content, "originGeohash")?, "originGeohash")?;
    let destination = as_str(get_field(content, "destinationGeohash")?, "destinationGeohash")?;
    let mass = as_u64(get_field(content, "massGrams")?, "massGrams")?;
    let volume = as_u64(get_field(content, "volumeMl")?, "volumeMl")?;
    let class = as_str(get_field(content, "classOfService")?, "classOfService")?;
    let class_idx = enum_index("classOfService", class, CLASS_OF_SERVICE)?;
    if mass > u32::MAX as u64 {
        return Err(EncodeError::OutOfRange { field: "massGrams", value: mass.to_string() });
    }
    if volume > u32::MAX as u64 {
        return Err(EncodeError::OutOfRange { field: "volumeMl", value: volume.to_string() });
    }
    Ok(encode_params(vec![
        DynSolValue::String(origin.to_string()),
        DynSolValue::String(destination.to_string()),
        DynSolValue::Uint(U256::from(mass), 32),
        DynSolValue::Uint(U256::from(volume), 32),
        DynSolValue::Uint(U256::from(class_idx), 8),
    ]))
}

// ── figaro-fulfilment-v2 ─────────────────────────────────────────────

const FULFILMENT_MODALITY: &[(&str, u8)] = &[
    ("consume-onsite", 1),
    ("pickup", 2),
    ("delivery", 3),
    ("virtual", 4),
];

const FULFILMENT_COORDINATION: &[(&str, u8)] = &[
    ("buyer-assigned", 1),
    ("seller-assigned", 2),
    ("dutch-auction", 3),
];

const FULFILMENT_HANDOFF_POINT: &[(&str, u8)] = &[
    ("face-to-face", 1),
    ("dead-drop", 2),
    ("parking-area", 3),
    ("locker", 4),
];

fn encode_string_enum_array(
    content: &Value,
    field: &'static str,
    table: &[(&str, u8)],
    required: bool,
) -> Result<DynSolValue, EncodeError> {
    let value = match opt_field(content, field) {
        Some(v) => v,
        None => {
            if required {
                return Err(EncodeError::MissingField(field));
            }
            return Ok(DynSolValue::Array(vec![]));
        }
    };
    let arr = as_array(value, field)?;
    let mut indices = Vec::with_capacity(arr.len());
    for item in arr {
        let s = as_str(item, field)?;
        let idx = enum_index(field, s, table)?;
        indices.push(DynSolValue::Uint(U256::from(idx), 8));
    }
    Ok(DynSolValue::Array(indices))
}

fn encode_fulfilment(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let modalities = encode_string_enum_array(content, "modalities", FULFILMENT_MODALITY, true)?;
    let coordinations = encode_string_enum_array(content, "coordinations", FULFILMENT_COORDINATION, false)?;
    let handoff_points = encode_string_enum_array(content, "handoffPoints", FULFILMENT_HANDOFF_POINT, false)?;
    Ok(encode_params(vec![modalities, coordinations, handoff_points]))
}

// ── figaro-jurisdiction-v1 ───────────────────────────────────────────

const KLEROS_COURT: &[(&str, u8)] = &[
    ("general", 1),
    ("blockchain-nontechnical", 2),
    ("blockchain-technical", 3),
    ("english-language", 4),
];

fn encode_jurisdiction(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let kleros_court_index = match opt_field(content, "klerosCourt") {
        Some(v) => enum_index("klerosCourt", as_str(v, "klerosCourt")?, KLEROS_COURT)?,
        None => 0,
    };
    let kleros_min_jurors = if kleros_court_index == 0 {
        0u8
    } else {
        match opt_field(content, "klerosMinJurors") {
            Some(v) => {
                let n = as_u64(v, "klerosMinJurors")?;
                if n > 255 {
                    return Err(EncodeError::OutOfRange {
                        field: "klerosMinJurors",
                        value: n.to_string(),
                    });
                }
                n as u8
            }
            None => 3,
        }
    };
    let applicable_law = opt_field(content, "applicableLaw")
        .map(|v| as_str(v, "applicableLaw"))
        .transpose()?
        .unwrap_or("");
    let forum = opt_field(content, "forum")
        .map(|v| as_str(v, "forum"))
        .transpose()?
        .unwrap_or("");
    let language = opt_field(content, "language")
        .map(|v| as_str(v, "language"))
        .transpose()?
        .unwrap_or("");
    Ok(encode_params(vec![
        DynSolValue::Uint(U256::from(kleros_court_index), 8),
        DynSolValue::Uint(U256::from(kleros_min_jurors), 8),
        DynSolValue::String(applicable_law.to_string()),
        DynSolValue::String(forum.to_string()),
        DynSolValue::String(language.to_string()),
    ]))
}

// ── figaro-commerce-v1 ───────────────────────────────────────────────

fn encode_commerce(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let currency_str = as_str(get_field(content, "currency")?, "currency")?;
    let currency = parse_address(currency_str, "currency")?;
    let payment = parse_bigint(get_field(content, "payment")?, "payment")?;
    let line_items = as_array(get_field(content, "lineItems")?, "lineItems")?;
    let mut items = Vec::with_capacity(line_items.len());
    for li in line_items {
        let item_id = as_str(get_field(li, "itemId")?, "lineItems[].itemId")?;
        let name = as_str(get_field(li, "name")?, "lineItems[].name")?;
        let quantity = parse_bigint(get_field(li, "quantity")?, "lineItems[].quantity")?;
        let unit_price = parse_bigint(get_field(li, "unitPrice")?, "lineItems[].unitPrice")?;
        items.push(DynSolValue::Tuple(vec![
            DynSolValue::String(item_id.to_string()),
            DynSolValue::String(name.to_string()),
            DynSolValue::Uint(quantity, 256),
            DynSolValue::Uint(unit_price, 256),
        ]));
    }
    Ok(encode_params(vec![
        DynSolValue::Address(currency),
        DynSolValue::Uint(payment, 256),
        DynSolValue::Array(items),
    ]))
}

// ── figaro-proximity-policy-v1 + figaro-proximity-proof-v1 ───────────

const PROXIMITY_BAND: &[(&str, u8)] = &[
    ("zone-wifi", 1),
    ("nearby-ble", 2),
    ("contact-nfc", 3),
];

fn encode_proximity_policy(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let bands = encode_string_enum_array(content, "bands", PROXIMITY_BAND, true)?;
    Ok(encode_params(vec![bands]))
}

fn encode_proximity_proof(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let band_str = as_str(get_field(content, "band")?, "band")?;
    let band = enum_index("band", band_str, PROXIMITY_BAND)?;
    let nonce_str = as_str(get_field(content, "nonce")?, "nonce")?;
    let nonce = parse_bytes32(nonce_str, "nonce")?;
    let device_sig_str = as_str(get_field(content, "deviceSig")?, "deviceSig")?;
    let device_sig = parse_bytes(device_sig_str, "deviceSig")?;
    Ok(encode_params(vec![
        DynSolValue::Uint(U256::from(band), 8),
        DynSolValue::FixedBytes(nonce, 32),
        DynSolValue::Bytes(device_sig),
    ]))
}

// ── figaro-offset-policy-v1 ──────────────────────────────────────────

const OFFSET_PROVIDER: &[(&str, u8)] = &[
    ("klima", 1),
    ("toucan", 2),
    ("moss", 3),
    ("custom", 4),
];

fn encode_offset_policy(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let providers = encode_string_enum_array(content, "providers", OFFSET_PROVIDER, true)?;
    Ok(encode_params(vec![providers]))
}

// ── figaro-merchant-process-v1 ───────────────────────────────────────

const MERCHANT_EVENT: &[(&str, u8)] = &[
    ("order-received", 0),
    ("accepted", 1),
    ("prep-started", 2),
    ("ready-for-pickup", 3),
    ("handed-off", 4),
    ("cancelled", 5),
];

fn encode_merchant_process(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let event_type_str = as_str(get_field(content, "eventType")?, "eventType")?;
    let event_type = enum_index("eventType", event_type_str, MERCHANT_EVENT)?;
    let evidence_uri = opt_field(content, "evidenceUri")
        .map(|v| as_str(v, "evidenceUri"))
        .transpose()?
        .unwrap_or("");
    Ok(encode_params(vec![
        DynSolValue::Uint(U256::from(event_type), 8),
        DynSolValue::String(evidence_uri.to_string()),
    ]))
}

// ── figaro-courier-process-v1 ────────────────────────────────────────

const COURIER_EVENT: &[(&str, u8)] = &[
    ("available", 0),
    ("accepted", 1),
    ("en-route-pickup", 2),
    ("arrived-pickup", 3),
    ("in-transit", 4),
    ("arrived-dropoff", 5),
    ("completed", 6),
    ("cancelled", 7),
];

fn encode_courier_process(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let event_type_str = as_str(get_field(content, "eventType")?, "eventType")?;
    let event_type = enum_index("eventType", event_type_str, COURIER_EVENT)?;
    let evidence_uri = opt_field(content, "evidenceUri")
        .map(|v| as_str(v, "evidenceUri"))
        .transpose()?
        .unwrap_or("");
    Ok(encode_params(vec![
        DynSolValue::Uint(U256::from(event_type), 8),
        DynSolValue::String(evidence_uri.to_string()),
    ]))
}

// ── figaro-consent-v1 ────────────────────────────────────────────────

fn encode_consent(content: &Value) -> Result<Vec<u8>, EncodeError> {
    let documents = as_array(get_field(content, "documents")?, "documents")?;
    let mut hashes = Vec::with_capacity(documents.len());
    let mut versions = Vec::with_capacity(documents.len());
    let mut titles = Vec::with_capacity(documents.len());
    for doc in documents {
        let hash_str = as_str(get_field(doc, "documentHash")?, "documents[].documentHash")?;
        hashes.push(DynSolValue::FixedBytes(parse_bytes32(hash_str, "documents[].documentHash")?, 32));
        let version = as_str(get_field(doc, "documentVersion")?, "documents[].documentVersion")?;
        versions.push(DynSolValue::String(version.to_string()));
        let title = as_str(get_field(doc, "documentTitle")?, "documents[].documentTitle")?;
        titles.push(DynSolValue::String(title.to_string()));
    }
    Ok(encode_params(vec![
        DynSolValue::Array(hashes),
        DynSolValue::Array(versions),
        DynSolValue::Array(titles),
    ]))
}
