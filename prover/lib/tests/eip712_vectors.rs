//! The guest's leg of the EIP-712 lock.
//!
//! `sdk/tests/eip712Parity.test.ts` freezes SDK-computed hashes into
//! `test/fixtures/eip712-vectors.json`; `Eip712ParityTest` asserts FigaroCore
//! reproduces the commitment vectors. This file asserts the guest reproduces
//! them too, and the three authorizations that exist on the batch path only
//! — `ResolveProcess`, `AttestSeller`, `AttestBuyer` — where a signature
//! stands for the direct path's `msg.sender`. The verifier's tests hold its
//! typehashes to the same strings; the SDK's hash, computed by viem from them,
//! is the one independent statement of what a wallet signs.
use alloy_primitives::B256;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::derive_commitment_ids;

mod common;
use common::{addr, b256, commitment_json, s, u256};

fn fixture() -> serde_json::Value {
    common::fixture("eip712-vectors.json")
}

#[test]
fn the_guest_reproduces_every_commitment_vector() {
    let fx = fixture();
    let chain_id = fx["chainId"].as_u64().unwrap();
    let domain = domain_separator(chain_id, addr(&fx["verifyingContract"]));
    assert_eq!(domain, b256(&fx["domainSeparator"]), "domain separator");

    let vectors = fx["vectors"].as_array().expect("vectors");
    assert!(!vectors.is_empty());
    for v in vectors {
        let label = s(&v["label"]);
        let commitment = commitment_json(&v["commitment"], "processId");
        assert_eq!(
            commitment_struct_hash(&commitment),
            b256(&v["structHash"]),
            "{label}: struct hash"
        );
        let (order_hash, process_id) = derive_commitment_ids(&domain, &commitment);
        assert_eq!(process_id, b256(&v["processId"]), "{label}: process id");
        assert_eq!(order_hash, b256(&v["orderHash"]), "{label}: order hash");
    }
}

#[test]
fn the_guest_reproduces_every_batch_authorization() {
    let fx = fixture();
    let chain_id = fx["chainId"].as_u64().unwrap();
    let batch = &fx["batch"];
    let domain = domain_separator(chain_id, addr(&batch["verifyingContract"]));
    assert_eq!(
        domain,
        b256(&batch["domainSeparator"]),
        "the verifier's domain separator"
    );

    let mut seen = std::collections::BTreeSet::new();
    for a in batch["authorizations"].as_array().expect("authorizations") {
        let kind = s(&a["type"]);
        let m = &a["message"];
        let struct_hash = match kind {
            "ResolveProcess" => {
                resolve_struct_hash(&b256(&m["processId"]), &u256(&m["runningTotal"]))
            }
            "AttestSeller" => attest_seller_struct_hash(
                &b256(&m["orderHash"]),
                &b256(&m["clauseId"]),
                m["stage"].as_u64().unwrap() as u8,
                &b256(&m["contentRef"]),
            ),
            "AttestBuyer" => attest_buyer_struct_hash(
                &b256(&m["processId"]),
                &b256(&m["orderHash"]),
                &b256(&m["clauseId"]),
                m["stage"].as_u64().unwrap() as u8,
                &b256(&m["contentRef"]),
            ),
            other => panic!("unknown authorization {other}"),
        };
        assert_eq!(
            struct_hash,
            b256(&a["structHash"]),
            "{kind}: struct hash — {m}"
        );
        assert_eq!(
            typed_data_hash(&domain, &struct_hash),
            b256(&a["digest"]),
            "{kind}: digest — {m}"
        );
        seen.insert(kind.to_string());
    }
    assert_eq!(
        seen.len(),
        3,
        "the fixture carries all three authorizations"
    );
}

/// `attest_digest`, the one function the guest's signer gate and the
/// relay's question to a wallet's code both call, is the SDK's
/// `AttestSeller` / `AttestBuyer` digest under the verifier's domain for
/// every attestation vector (stages 0, 1 and 255).
#[test]
fn attest_digest_is_the_sdk_s_digest_for_both_roles() {
    use figaro_kernel::kernel::attest_digest;
    use figaro_kernel::types::AttesterRole;
    let fx = fixture();
    let batch = &fx["batch"];
    let domain = domain_separator(
        fx["chainId"].as_u64().unwrap(),
        addr(&batch["verifyingContract"]),
    );
    let mut roles = std::collections::BTreeSet::new();
    for a in batch["authorizations"].as_array().expect("authorizations") {
        let m = &a["message"];
        let (role, process_id) = match s(&a["type"]) {
            // The seller's struct names no process: any word stands for it.
            "AttestSeller" => (AttesterRole::Seller, B256::repeat_byte(0xee)),
            "AttestBuyer" => (AttesterRole::Buyer, b256(&m["processId"])),
            _ => continue,
        };
        assert_eq!(
            attest_digest(
                &domain,
                role,
                &process_id,
                &b256(&m["orderHash"]),
                &b256(&m["clauseId"]),
                m["stage"].as_u64().unwrap() as u8,
                &b256(&m["contentRef"]),
            ),
            b256(&a["digest"]),
            "{role:?} at stage {}",
            m["stage"]
        );
        roles.insert(format!("{role:?}"));
    }
    assert_eq!(roles.len(), 2, "both roles are vectored");
}
