//! The rules crate's tests' one support module: the parity keys and addresses, the
//! fixture loader and its field readers, signing, and the one helper that
//! runs a batch through BOTH entries of the rules — the relay's native run
//! (`apply_batch_with_state`) and the proof program's (`apply_guest` on the
//! witness the relay builds, `guest_input`) — and holds them to the same
//! answer.
//!
//! Each test file includes it with `mod common;`; a file uses only part of
//! it, so unused items are allowed here.
#![allow(dead_code)]

use std::str::FromStr;

use alloy_primitives::{address, keccak256, Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::{commitment_struct_hash, typed_data_hash};
use figaro_kernel::kernel::{
    apply_batch_with_state, apply_claims, apply_guest, apply_operations, guest_input,
};
use figaro_kernel::state::KernelState;
use figaro_kernel::types::*;

// ── The parity keys and the Foundry deployment they sign for ─────────

/// The secrets the Foundry parity tests sign with (`vm.addr`).
pub const BUYER_KEY: u64 = 0xB0B;
pub const SELLER1_KEY: u64 = 0x5E11;
pub const SELLER2_KEY: u64 = 0x5E12;
pub const SELLER3_KEY: u64 = 0x5E13;

/// The wallets those secrets derive (`vm.addr`), pinned so a key and its
/// address are two independent statements (`a_parity_key_recovers_its_pinned_address`
/// in `parity.rs` holds them to the rules crate's signer recovery).
pub const BUYER: Address = address!("0376AAc07Ad725E01357B1725B5ceC61aE10473c");
pub const SELLER1: Address = address!("Ad29D7a8aD3639F97798c768202F27C1dE81DC55");
pub const SELLER2: Address = address!("C22667C5926d1C9af6C0fa8Cedc4ea3e489F6F70");

/// Foundry's deterministic deployments in the parity tests.
pub const TOKEN: Address = address!("5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f");
pub const CORE: Address = address!("2e234DAe75C793f67A35089C9d99245E1C58470b");
pub const CHAIN_ID: u64 = 31337;

// ── Fixtures ─────────────────────────────────────────────────────────

/// The repository's root, two levels above this crate.
pub fn repo_root() -> std::path::PathBuf {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p
}

/// A JSON fixture under `test/fixtures/`, by its file name.
pub fn fixture(name: &str) -> serde_json::Value {
    let p = repo_root().join("test/fixtures").join(name);
    let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    serde_json::from_str(&text).expect("fixture JSON")
}

/// The environment variable that makes a fixture-writing test write its
/// fixture before it compares: `FIGARO_WRITE_FIXTURES=1 cargo test -p
/// figaro-kernel --test <file>`.
pub const WRITE_FIXTURES: &str = "FIGARO_WRITE_FIXTURES";

/// Hold the committed fixture `name` (under `test/fixtures/`) to `produced`,
/// what this build's encoder writes: a drift between the two fails. With
/// `FIGARO_WRITE_FIXTURES=1` the fixture is first rewritten from `produced`,
/// so the same test is the generator; the comparison then still runs.
pub fn committed_fixture_is(name: &str, produced: &serde_json::Value) {
    let path = repo_root().join("test/fixtures").join(name);
    if std::env::var(WRITE_FIXTURES).as_deref() == Ok("1") {
        std::fs::write(
            &path,
            serde_json::to_string_pretty(produced).unwrap() + "\n",
        )
        .unwrap_or_else(|e| panic!("write {}: {e}", path.display()));
    }
    let committed = fixture(name);
    assert_eq!(
        &committed, produced,
        "{name} drifted from the encoder: rewrite it with {WRITE_FIXTURES}=1"
    );
}

pub fn s(v: &serde_json::Value) -> &str {
    v.as_str().expect("string field")
}
pub fn b256(v: &serde_json::Value) -> B256 {
    B256::from_str(s(v)).expect("bytes32")
}
pub fn addr(v: &serde_json::Value) -> Address {
    Address::from_str(s(v)).expect("address")
}
/// A uint the fixtures write as a decimal string (a uint256 does not fit
/// JSON's number).
pub fn u256(v: &serde_json::Value) -> U256 {
    U256::from_str_radix(s(v), 10).expect("decimal uint")
}
pub fn count(v: &serde_json::Value) -> usize {
    s(v).parse().expect("count")
}
pub fn words(v: &serde_json::Value) -> Vec<B256> {
    v.as_array().expect("array").iter().map(b256).collect()
}
pub fn hex_bytes(v: &serde_json::Value) -> Vec<u8> {
    alloy_primitives::hex::decode(s(v)).expect("hex")
}
/// A 65-byte `r ‖ s ‖ v` signature as the Foundry half writes it.
pub fn signature(v: &serde_json::Value) -> Signature {
    let bytes = hex_bytes(v);
    assert_eq!(bytes.len(), 65, "a stream signature is 65 bytes");
    Signature {
        r: B256::from_slice(&bytes[..32]),
        s: B256::from_slice(&bytes[32..64]),
        v: bytes[64],
    }
}

/// A commitment as a fixture object writes it, its own process id under
/// `process_id_key` (the Foundry streams write `commitmentProcessId`, beside
/// the derived `processId`; the SDK's vectors write `processId`).
pub fn commitment_json(o: &serde_json::Value, process_id_key: &str) -> Commitment {
    Commitment {
        process_id: b256(&o[process_id_key]),
        buyer: addr(&o["buyer"]),
        seller: addr(&o["seller"]),
        token: addr(&o["token"]),
        payment: u256(&o["payment"]),
        running_total: u256(&o["runningTotal"]),
        checkout_hash: b256(&o["checkoutHash"]),
        salt: u256(&o["salt"]),
        commit_deadline: u256(&o["commitDeadline"]),
    }
}

/// The `Attestation` event as the EVM logs it: the signature and the three
/// indexed words as topics, the three unindexed words as data. Written here
/// from the coordinator's event declaration, independently of the rules crate.
pub fn encode_log(e: &AttestationEventData) -> (Vec<B256>, Vec<u8>) {
    let signature = keccak256(b"Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)");
    let mut attester = [0u8; 32];
    attester[12..].copy_from_slice(e.attester.as_slice());
    let mut data = Vec::with_capacity(96);
    data.extend_from_slice(e.clause_id.as_slice());
    let mut stage = [0u8; 32];
    stage[31] = e.stage;
    data.extend_from_slice(&stage);
    data.extend_from_slice(e.content_ref.as_slice());
    (
        vec![signature, e.order_hash, e.process_id, B256::from(attester)],
        data,
    )
}

// ── Keys and signatures ─────────────────────────────────────────────

pub fn make_signing_key(secret: u64) -> SigningKey {
    let mut bytes = [0u8; 32];
    bytes[24..].copy_from_slice(&secret.to_be_bytes());
    SigningKey::from_bytes((&bytes).into()).unwrap()
}

/// The wallet a key signs for, derived from its public key.
pub fn key_address(key: &SigningKey) -> Address {
    let pubkey = key.verifying_key().to_encoded_point(false);
    Address::from_slice(&keccak256(&pubkey.as_bytes()[1..])[12..])
}

pub fn sign_digest(key: &SigningKey, digest: &B256) -> Signature {
    use k256::ecdsa::{signature::hazmat::PrehashSigner, RecoveryId};
    let (sig, recid): (k256::ecdsa::Signature, RecoveryId) =
        key.sign_prehash(digest.as_slice()).unwrap();
    let bytes = sig.to_bytes();
    Signature {
        v: recid.to_byte() + 27,
        r: B256::from_slice(&bytes[..32]),
        s: B256::from_slice(&bytes[32..]),
    }
}

pub fn sign_commitment(c: &Commitment, domain: &B256, key: &SigningKey) -> Signature {
    sign_digest(key, &typed_data_hash(domain, &commitment_struct_hash(c)))
}

pub fn empty_snapshot() -> KernelStateSnapshot {
    KernelStateSnapshot {
        processes: vec![],
        order_status: vec![],
    }
}

// ── Both entries of the rules ───────────────────────────────────────

/// What a native run returns: the public values, the positions, the events
/// and the post-state.
pub type Run = (PublicValues, Vec<NetPosition>, BatchEvents, KernelState);

/// Run `input` through the relay's native entry and through the proof
/// program's, and hold them to one answer; return the native run's.
///
/// - Accepted natively: the relay's witness builder (`guest_input`, the
///   function `prove_batch` calls) must build the guest's input, and
///   `apply_guest` on it must return the same public values (byte for byte,
///   as the guest commits them), the same positions and the same events.
/// - Refused natively: `guest_input` refuses with the same error; and the
///   guest, handed the witness of exactly the entries the native run read
///   before it refused, refuses with the same error too, so a batch the
///   relay refuses is one no prover can prove.
pub fn run_both_with_state(input: &BatchInput) -> Result<Run, KernelError> {
    let native = apply_batch_with_state(input);
    match &native {
        Ok((pv, positions, events, _)) => {
            let guest = guest_input(input).unwrap_or_else(|e| {
                panic!("the native run accepted the batch, the witness builder refused it: {e:?}")
            });
            let (gpv, gpositions, gevents) = apply_guest(&guest).unwrap_or_else(|e| {
                panic!("the native run accepted the batch, the guest refused it: {e:?}")
            });
            assert_eq!(
                gpv.abi_encode(),
                pv.abi_encode(),
                "the guest commits the native run's public values"
            );
            assert_eq!(
                format!("{gpositions:?}"),
                format!("{positions:?}"),
                "the guest's positions are the native run's"
            );
            assert_eq!(
                format!("{gevents:?}"),
                format!("{events:?}"),
                "the guest's events are the native run's"
            );
        }
        Err(e) => {
            let want = format!("{e:?}");
            match guest_input(input) {
                Ok(_) => panic!("the native run refused with {want}, the witness builder accepted"),
                Err(ge) => assert_eq!(format!("{ge:?}"), want, "the witness builder's refusal"),
            }
            let guest = witness_up_to_the_refusal(input);
            match apply_guest(&guest) {
                Ok(_) => panic!("the native run refused with {want}, the guest ACCEPTED"),
                Err(ge) => assert_eq!(format!("{ge:?}"), want, "the guest's refusal"),
            }
        }
    }
    native
}

/// `run_both_with_state` without the post-state.
pub fn run_both(
    input: &BatchInput,
) -> Result<(PublicValues, Vec<NetPosition>, BatchEvents), KernelError> {
    run_both_with_state(input).map(|(pv, positions, events, _)| (pv, positions, events))
}

/// The guest's input for a batch the native run refuses: `guest_input`
/// refuses such a batch and builds no witness, so this one carries the
/// witness of every entry the native rules read before the refusal (the
/// public `apply_operations` and `apply_claims`, in the order `execute`
/// runs them), against the previous state.
fn witness_up_to_the_refusal(input: &BatchInput) -> GuestInput {
    let prev = KernelState::from_snapshot(&input.prev_state);
    let mut state = prev.clone();
    if apply_operations(
        &mut state,
        input.chain_id,
        input.verifying_contract,
        input.block_timestamp,
        &input.operations,
    )
    .is_ok()
    {
        let _ = apply_claims(
            &state,
            input.chain_id,
            input.verifying_contract,
            &input.usage_claims,
        );
    }
    GuestInput {
        chain_id: input.chain_id,
        verifying_contract: input.verifying_contract,
        block_timestamp: input.block_timestamp,
        operations: input.operations.clone(),
        prev_witness: prev.witness_for(&state.touched()),
        usage_claims: input.usage_claims.clone(),
        usage_period: input.usage_period,
    }
}
