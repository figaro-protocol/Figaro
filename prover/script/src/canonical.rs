//! The SDK's `canonicalize` (`sdk/src/agreement.ts`) — `JSON.stringify`
//! with every object's keys sorted, compact — reproduced byte for byte. It
//! is the one canonical form of the Rust tests: this crate uses it as a
//! module, and the test crate of `prover/lib` includes this file by path,
//! so no test keeps a form of its own.
//!
//! Two rules make it ECMAScript's and not serde_json's:
//! - `JSON.stringify` writes an object's array-index keys (`"2"`, `"10"`)
//!   first, in numeric order, and the rest in sorted UTF-16 order, so a
//!   sorted map alone is not it.
//! - `JSON.parse` reads every number as a double, and `JSON.stringify`
//!   writes that double as `Number.prototype.toString` does: an integer
//!   above 2^53 is rounded to the nearest double, and an exponent carries
//!   its sign (`1e+21`, `1e-7`).
//!
//! `prover/script/tests/clause_keys.rs` pins it to the SDK's keys, a spec
//! with a float, an integer above 2^53 and index-like keys among them.
#![allow(dead_code)]

use serde_json::{Number, Value};

/// The canonical form of a JSON value.
pub fn canonicalize(value: &Value) -> String {
    let mut out = String::new();
    write_canonical(value, &mut out);
    out
}

/// An ECMAScript array index: the canonical decimal form of an integer
/// below 2^32 - 1.
fn array_index(key: &str) -> Option<u32> {
    if key.is_empty() || (key.len() > 1 && key.starts_with('0')) {
        return None;
    }
    if !key.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    key.parse::<u32>().ok().filter(|n| *n != u32::MAX)
}

fn write_canonical(value: &Value, out: &mut String) {
    match value {
        Value::Object(map) => {
            let mut indexed: Vec<(u32, &String)> = Vec::new();
            let mut named: Vec<&String> = Vec::new();
            for k in map.keys() {
                match array_index(k) {
                    Some(n) => indexed.push((n, k)),
                    None => named.push(k),
                }
            }
            indexed.sort_by_key(|(n, _)| *n);
            named.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            out.push('{');
            let keys = indexed.into_iter().map(|(_, k)| k).chain(named);
            for (i, k) in keys.enumerate() {
                if i > 0 {
                    out.push(',');
                }
                out.push_str(&serde_json::to_string(k).expect("key"));
                out.push(':');
                write_canonical(&map[k], out);
            }
            out.push('}');
        }
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out);
            }
            out.push(']');
        }
        Value::Number(n) => write_number(n, out),
        other => out.push_str(&serde_json::to_string(other).expect("scalar")),
    }
}

/// `Number.prototype.toString` of the double `JSON.parse` reads for `n`
/// (ECMA-262, Number::toString, radix 10). Rust's `{:e}` gives the shortest
/// digits that round-trip, the digits ECMAScript picks; the layout below is
/// ECMAScript's.
fn write_number(n: &Number, out: &mut String) {
    let f = n.as_f64().expect("a JSON number reads as a double");
    if f == 0.0 {
        // `-0` is written `0`.
        out.push('0');
        return;
    }
    if f < 0.0 {
        out.push('-');
    }
    let sci = format!("{:e}", f.abs());
    let (mantissa, exponent) = sci.split_once('e').expect("exponent form");
    let exponent: i32 = exponent.parse().expect("exponent");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let point = exponent + 1;
    if k <= point && point <= 21 {
        out.push_str(&digits);
        out.extend(std::iter::repeat_n('0', (point - k) as usize));
    } else if 0 < point && point <= 21 {
        out.push_str(&digits[..point as usize]);
        out.push('.');
        out.push_str(&digits[point as usize..]);
    } else if -6 < point && point <= 0 {
        out.push_str("0.");
        out.extend(std::iter::repeat_n('0', (-point) as usize));
        out.push_str(&digits);
    } else {
        out.push_str(&digits[..1]);
        if k > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        out.push('e');
        out.push(if point - 1 >= 0 { '+' } else { '-' });
        out.push_str(&(point - 1).abs().to_string());
    }
}
