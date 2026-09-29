//! The guest's leg of the EIP-712 lock.
//!
//! `sdk/tests/eip712Parity.test.ts` freezes SDK-computed hashes into
//! `test/fixtures/eip712-vectors.json`; `Eip712ParityTest` asserts the kernel
//! reproduces the commitment vectors. This file asserts the guest reproduces
//! them too, and the three authorizations that exist on the batch path only
//! — `ResolveProcess`, `AttestSeller`, `AttestBuyer` — where a signature
//! stands for the direct path's `msg.sender`. Those three have no Solidity
//! counterpart: the SDK's hash, computed by viem from the type string alone,
//! is the one independent statement of what a wallet signs.
use std::str::FromStr;

use alloy_primitives::{Address, B256, U256};

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::derive_commitment_ids;
use figaro_kernel::types::Commitment;

fn fixture() -> serde_json::Value {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("test/fixtures/eip712-vectors.json");
    let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    serde_json::from_str(&text).expect("fixture JSON")
}

fn s(v: &serde_json::Value) -> &str {
    v.as_str().expect("string field")
}
fn b256(v: &serde_json::Value) -> B256 {
    B256::from_str(s(v)).expect("bytes32")
}
fn addr(v: &serde_json::Value) -> Address {
    Address::from_str(s(v)).expect("address")
}
fn u256(v: &serde_json::Value) -> U256 {
    U256::from_str_radix(s(v), 10).expect("decimal uint")
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
        let c = &v["commitment"];
        let commitment = Commitment {
            process_id: b256(&c["processId"]),
            buyer: addr(&c["buyer"]),
            seller: addr(&c["seller"]),
            currency: addr(&c["currency"]),
            payment: u256(&c["payment"]),
            expected_cumulative_value: u256(&c["expectedCumulativeValue"]),
            agreement_hash: b256(&c["agreementHash"]),
            salt: u256(&c["salt"]),
            deadline: u256(&c["deadline"]),
        };
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
    assert_eq!(domain, b256(&batch["domainSeparator"]), "the verifier's domain separator");

    let mut seen = std::collections::BTreeSet::new();
    for a in batch["authorizations"].as_array().expect("authorizations") {
        let kind = s(&a["type"]);
        let m = &a["message"];
        let struct_hash = match kind {
            "ResolveProcess" => resolve_struct_hash(&b256(&m["processId"])),
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
        assert_eq!(struct_hash, b256(&a["structHash"]), "{kind}: struct hash — {m}");
        assert_eq!(
            typed_data_hash(&domain, &struct_hash),
            b256(&a["digest"]),
            "{kind}: digest — {m}"
        );
        seen.insert(kind.to_string());
    }
    assert_eq!(seen.len(), 3, "the fixture carries all three authorizations");
}
