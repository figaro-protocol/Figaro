//! The cross-language lock for the three sibling packers — positions,
//! attestations, spec bindings. `FigaroBatchVerifier` packs each by hand in
//! assembly and the guest packs each in `compute_*_hash`; each side has an
//! independent mirror in its own suite, which proves each side is
//! self-consistent but NOT that the two agree. These vectors are generated
//! HERE and asserted verbatim on the Solidity side
//! (`test/core/verifier/FigaroBatchVerifierTest.t.sol::test_packerHashes_matchTheRustVectors`),
//! the way `usage.rs::the_usage_hash_matches_the_solidity_vector` locks the
//! fourth packer. A byte of layout drift in either language fails exactly
//! one of the two.
//!
//! The string literals are OPAQUE PREIMAGE BYTES pinned byte-for-byte to the
//! Solidity side; renaming one here without the other breaks the lock.
use alloy_primitives::{address, b256, keccak256, U256};

use figaro_kernel::kernel::{
    compute_attestation_events_hash, compute_positions_hash, compute_spec_bindings_hash,
};
use figaro_kernel::types::{AttestationEventData, NetPosition, SpecBinding};

fn ether(n: u64) -> U256 {
    U256::from(n) * U256::from(1_000_000_000_000_000_000u64)
}

#[test]
fn the_positions_hash_matches_the_solidity_vector() {
    let positions = vec![
        NetPosition {
            token: address!("0000000000000000000000000000000000000001"),
            user: address!("0000000000000000000000000000000000000002"),
            deposit: ether(200),
            payout: U256::ZERO,
        },
        NetPosition {
            token: address!("0000000000000000000000000000000000000001"),
            user: address!("0000000000000000000000000000000000000003"),
            deposit: ether(100),
            payout: ether(350),
        },
    ];
    assert_eq!(
        compute_positions_hash(&positions),
        b256!("9bd2d9af56189ba485fc2e232edeafb4bccd8fd1fdc286064ada3f97b522766d")
    );
}

#[test]
fn the_attestations_hash_matches_the_solidity_vector() {
    let events = vec![
        AttestationEventData {
            order_hash: keccak256(b"order-a"),
            process_id: keccak256(b"process-a"),
            attester: address!("0000000000000000000000000000000000000004"),
            clause_id: keccak256(b"clause-a"),
            stage: 1,
            content_ref: keccak256(b"content-a"),
        },
        AttestationEventData {
            order_hash: keccak256(b"order-b"),
            process_id: keccak256(b"process-a"),
            attester: address!("0000000000000000000000000000000000000005"),
            clause_id: keccak256(b"clause-b"),
            stage: 0,
            content_ref: keccak256(b"content-b"),
        },
    ];
    assert_eq!(
        compute_attestation_events_hash(&events),
        b256!("8d905f5a099cb2530f0912090a34135967c19e660b79a2ba7275489145a74dfc")
    );
}

#[test]
fn the_spec_bindings_hash_matches_the_solidity_vector() {
    let bindings = vec![
        SpecBinding {
            clause_id: keccak256(b"clause-a"),
            spec_hash: keccak256(b"spec-a"),
        },
        SpecBinding {
            clause_id: keccak256(b"clause-b"),
            spec_hash: keccak256(b"spec-b"),
        },
    ];
    assert_eq!(
        compute_spec_bindings_hash(&bindings),
        b256!("46470c7694c808e183fefa90a173f9398346f792cf859f22e49b42e598da3704")
    );
}
