//! The operation-stream decoder over arbitrary bytes.
//!
//! The stream is calldata of `FigaroBatchVerifier.settleBatch`, so any byte
//! string reaches `decode_operation_stream` in the relay (`submitter.rs`) and
//! in a stranger's rebuild of the state (`rebuild.rs`). The target holds two
//! things: the decoder never panics, and every stream it accepts re-encodes,
//! through `encode_stream_parts`, to exactly the bytes it read (the decoder's
//! own doc comment states the round trip).
#![no_main]

use figaro_kernel::operation_stream::{decode_operation_stream, encode_stream_parts};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    if let Ok((operations, attestations, claims)) = decode_operation_stream(data) {
        let again = encode_stream_parts(&operations, &attestations, &claims);
        assert_eq!(
            again.as_slice(),
            data,
            "a decoded stream re-encodes to other bytes"
        );
    }
});
