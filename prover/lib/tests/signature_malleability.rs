//! The high-s twin of a signature.
//!
//! For every ECDSA signature `(r, s, v)` over secp256k1, `(r, n − s, v')`, with
//! `v'` the other recovery id (27 for 28, 28 for 27),
//! recovers the same public key. FigaroCore recovers through OpenZeppelin's
//! `ECDSA.recover`, which refuses any `s` above `n / 2`
//! (`ECDSAInvalidSignatureS`), so the mirror must refuse the twin as well:
//! a mirror that accepted it would apply a commit the Core refuses.
use alloy_primitives::{B256, U256};
use k256::ecdsa::{signature::hazmat::PrehashSigner, RecoveryId, SigningKey};

use figaro_kernel::eip712::recover_signer;
use figaro_kernel::types::{KernelError, Signature};

/// The order of secp256k1's group.
const SECP256K1_N: U256 = U256::from_be_slice(&[
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFE,
    0xBA, 0xAE, 0xDC, 0xE6, 0xAF, 0x48, 0xA0, 0x3B, 0xBF, 0xD2, 0x5E, 0x8C, 0xD0, 0x36, 0x41, 0x41,
]);

#[test]
fn recover_signer_refuses_the_high_s_twin_of_a_valid_signature() {
    let key = SigningKey::from_slice(&B256::repeat_byte(0x2a)[..]).expect("a valid secret");
    let digest = B256::repeat_byte(0x5c);
    let (sig, recid): (k256::ecdsa::Signature, RecoveryId) =
        key.sign_prehash(digest.as_slice()).expect("signing");
    let bytes = sig.to_bytes();
    let low = Signature {
        v: recid.to_byte() + 27,
        r: B256::from_slice(&bytes[..32]),
        s: B256::from_slice(&bytes[32..]),
    };

    // k256 signs low-s; the valid signature recovers its signer.
    let signer = recover_signer(&digest, &low).expect("the low-s signature recovers");
    let s = U256::from_be_bytes(low.s.0);
    assert!(s <= SECP256K1_N >> 1, "k256 signs low-s");

    let high = Signature { v: 55 - low.v, r: low.r, s: B256::from((SECP256K1_N - s).to_be_bytes::<32>()) };
    assert!(U256::from_be_bytes(high.s.0) > SECP256K1_N >> 1, "the twin is high-s");
    let twin = recover_signer(&digest, &high);
    assert!(
        matches!(twin, Err(KernelError::InvalidSignature)),
        "the high-s twin of {signer}'s signature must be refused, as ECDSA.recover refuses it; got {twin:?}"
    );
}
