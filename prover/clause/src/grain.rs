//! The geohash grain cap: cap(disposition, geocodeStandard) when the standard
//! is geohash — the Rust mirror of `sdk/src/clauses/grain.ts`.
//!
//! A clause spec carries the structural ceiling (`maxLength`) and the
//! attributes the cap reads: a field's disposition and its resolved format,
//! static or named by a sibling. A public geohash is neighborhood grade,
//! because its plaintext lands on a public artifact; a private one keeps fine
//! grain, because its plaintext never does. A standard this engine carries no
//! grain knowledge of is bounded by the field's `maxLength` only.

use crate::spec::Disposition;

/// The format key whose grain this module caps.
pub const GEOHASH_FORMAT: &str = "geohash";

/// 6 characters, about 1.2 km by 0.6 km: the neighborhood cell, the public cap.
pub const PUBLIC_GEOHASH_MAX_PRECISION: usize = 6;

/// 12 characters, about 3.7 cm: the finest grain a private geohash carries.
pub const PRIVATE_GEOHASH_MAX_PRECISION: usize = 12;

/// The precision cap for a geohash of this disposition, in UTF-16 units as
/// the SDK counts a string's length. Absent reads as public.
pub fn geohash_capture_precision(disposition: Option<Disposition>) -> usize {
    match disposition {
        Some(Disposition::Private) => PRIVATE_GEOHASH_MAX_PRECISION,
        _ => PUBLIC_GEOHASH_MAX_PRECISION,
    }
}
