//! The grain cap: cap(disposition, geocodeStandard) for each standard whose
//! grain this engine knows: geohash, H3, S2 and Open Location Code. The Rust
//! mirror of `sdk/src/clauses/grain.ts`.
//!
//! A clause spec carries the structural ceiling (`maxLength`) and the
//! attributes the cap reads: a field's disposition and its resolved format,
//! static or named by a sibling. A public location code is neighborhood
//! grade, because its plaintext lands on a public artifact; a private one
//! keeps fine grain, because its plaintext never does. A standard this engine
//! carries no grain knowledge of is bounded by the field's `maxLength` only.
//!
//! Each standard writes its grain in the code, and this module reads it
//! there: a geohash's length in characters (UTF-16 units), an H3 cell index's
//! resolution, an S2 cell token's level, an Open Location Code's length. The
//! public cap of each is the finest grade whose cells are, on average, no
//! smaller than a six-character geohash cell at 45 degrees of latitude: H3
//! resolution 8, S2 level 13, an Open Location Code of length 6. The private
//! cap is the standard's own finest grade, except geohash's, 12 characters.
//! A value whose grain cannot be read under a capped standard is refused.

use crate::spec::Disposition;

/// The format keys whose grain this module caps.
pub const GEOHASH_FORMAT: &str = "geohash";
pub const H3_FORMAT: &str = "h3";
pub const S2_FORMAT: &str = "s2";
pub const OLC_FORMAT: &str = "olc";

/// 6 characters, about 1.2 km by 0.6 km: the neighborhood cell, the public cap.
pub const PUBLIC_GEOHASH_MAX_PRECISION: usize = 6;

/// 12 characters, about 3.7 cm: the finest grain a private geohash carries.
pub const PRIVATE_GEOHASH_MAX_PRECISION: usize = 12;

/// A standard's grain cap: its public grade, its private grade, and the name
/// a message gives the grade.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GrainCap {
    pub public: usize,
    pub private: usize,
    pub grade: &'static str,
}

/// The cap of a format, or `None` when this engine carries no grain
/// knowledge of it.
pub fn grain_cap_of(format: &str) -> Option<GrainCap> {
    let (public, private, grade) = match format {
        GEOHASH_FORMAT => (
            PUBLIC_GEOHASH_MAX_PRECISION,
            PRIVATE_GEOHASH_MAX_PRECISION,
            "characters",
        ),
        H3_FORMAT => (8, 15, "resolution"),
        S2_FORMAT => (13, 30, "level"),
        OLC_FORMAT => (6, 15, "code length"),
        _ => return None,
    };
    Some(GrainCap {
        public,
        private,
        grade,
    })
}

/// The grade a cap allows a value of this disposition. Absent reads as public.
pub fn cap_of_disposition(cap: GrainCap, disposition: Option<Disposition>) -> usize {
    match disposition {
        Some(Disposition::Private) => cap.private,
        _ => cap.public,
    }
}

/// The precision cap for a geohash of this disposition, in UTF-16 units as
/// the SDK counts a string's length. Absent reads as public.
pub fn geohash_capture_precision(disposition: Option<Disposition>) -> usize {
    match disposition {
        Some(Disposition::Private) => PRIVATE_GEOHASH_MAX_PRECISION,
        _ => PUBLIC_GEOHASH_MAX_PRECISION,
    }
}

/// The grade a value carries under a format this module caps. `Some(None)`
/// when the value is no code of that format; `None` when the format is not
/// one this module caps. A geohash's grade is its length in UTF-16 units.
pub fn grain_of(format: &str, value: &str) -> Option<Option<usize>> {
    match format {
        GEOHASH_FORMAT => Some(Some(value.encode_utf16().count())),
        H3_FORMAT => Some(h3_resolution(value)),
        S2_FORMAT => Some(s2_level(value)),
        OLC_FORMAT => Some(olc_code_length(value)),
        _ => None,
    }
}

/// 1 to 16 ASCII hex digits read as a 64-bit word.
fn hex_word(value: &str) -> Option<u64> {
    if value.is_empty() || value.len() > 16 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    u64::from_str_radix(value, 16).ok()
}

/// An H3 cell index's resolution: bit 63 is 0, bits 59 to 62 hold mode 1,
/// bits 56 to 58 are 0, bits 52 to 55 the resolution, bits 45 to 51 the base
/// cell (under 122), then fifteen 3-bit digits, each 0 to 6 up to the
/// resolution and 7 past it.
fn h3_resolution(value: &str) -> Option<usize> {
    let index = hex_word(value)?;
    let bits = |shift: u32, mask: u64| (index >> shift) & mask;
    if bits(63, 0x1) != 0 || bits(59, 0xf) != 1 || bits(56, 0x7) != 0 {
        return None;
    }
    if bits(45, 0x7f) >= 122 {
        return None;
    }
    let resolution = bits(52, 0xf) as usize;
    for r in 1..=15usize {
        let digit = bits(3 * (15 - r as u32), 0x7);
        let bad = if r <= resolution {
            digit == 7
        } else {
            digit != 7
        };
        if bad {
            return None;
        }
    }
    Some(resolution)
}

/// An S2 cell token's level: the token is the cell id in hex with its
/// trailing zeros dropped; the id is 3 face bits (under 6), 2 bits a level,
/// then a 1 bit and zeros. The level is 30 less half the trailing zero bits,
/// so the lowest set bit is at most bit 60, the level-0 cell's: an id whose
/// lowest set bit is higher (the token `4`) is no cell id.
fn s2_level(value: &str) -> Option<usize> {
    let digits = hex_word(value)?;
    let id = digits << (4 * (16 - value.len() as u32));
    if id == 0 || id >> 61 > 5 {
        return None;
    }
    let zeros = id.trailing_zeros() as usize;
    if zeros % 2 != 0 || zeros > 60 {
        return None;
    }
    Some(30 - zeros / 2)
}

/// The Open Location Code's twenty digits, upper case.
const OLC_DIGITS: &[u8] = b"23456789CFGHJMPQRVWX";
/// Where a full code puts its separator.
const OLC_SEPARATOR_POSITION: usize = 8;
/// The longest code length the specification allows.
const OLC_MAX_LENGTH: usize = 15;

fn olc_digit(b: u8) -> Option<usize> {
    OLC_DIGITS.iter().position(|d| *d == b)
}

/// An Open Location Code's length, the count of its significant digits: a
/// full code puts the `+` separator after 8 characters; a padded code ends
/// at the separator, its padding an even run of `0` closing the part before
/// it; a short code puts the separator earlier and keeps the precision of the
/// full code it came from, 8 plus the digits after the separator. The digits
/// after the separator are never one alone, and a code carries at most 15.
fn olc_code_length(value: &str) -> Option<usize> {
    let code: Vec<u8> = value.bytes().map(|b| b.to_ascii_uppercase()).collect();
    if code.is_empty()
        || !code
            .iter()
            .all(|b| *b == b'0' || *b == b'+' || olc_digit(*b).is_some())
    {
        return None;
    }
    let separator = code.iter().position(|b| *b == b'+')?;
    if !(2..=OLC_SEPARATOR_POSITION).contains(&separator) || separator % 2 != 0 {
        return None;
    }
    let before = &code[..separator];
    let after = &code[separator + 1..];
    if after.iter().any(|b| *b == b'+' || *b == b'0') || after.len() == 1 {
        return None;
    }
    let padding = before.iter().position(|b| *b == b'0');
    if let Some(p) = padding {
        if separator != OLC_SEPARATOR_POSITION || p == 0 || p % 2 != 0 || !after.is_empty() {
            return None;
        }
        if !before[p..].iter().all(|b| *b == b'0') {
            return None;
        }
    }
    if separator == OLC_SEPARATOR_POSITION {
        let first = olc_digit(code[0])?;
        let second = olc_digit(code[1])?;
        if first >= 9 || second >= 18 {
            return None;
        }
    }
    let length = padding.unwrap_or(OLC_SEPARATOR_POSITION + after.len());
    (length <= OLC_MAX_LENGTH).then_some(length)
}
