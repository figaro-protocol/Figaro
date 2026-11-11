//! The differential fuzz lock: the mirror of FigaroCore replays a seeded stream of
//! operations FigaroCore itself ran, and must answer as FigaroCore did.
//!
//! `test/core/kernel/KernelDifferentialFuzzTest.t.sol` draws a stream of
//! commits, resolutions and attestations from a seed — valid ones and
//! deliberately malformed ones — runs each on `FigaroCore` or
//! `AttestationCoordinator`, and writes what the contract did to
//! `test/fixtures/streams/kernel.jsonl`, one JSON object per line. This
//! file replays the stream through `apply_batch_with_state`, one operation
//! per batch over the state the previous batch left — each attestation as
//! `AttestationWitness::HashOnly`, the coordinator's own arguments — and
//! asserts:
//!
//!   - every operation FigaroCore accepted, the mirror accepts, with the
//!     same process id and order hash;
//!   - every operation FigaroCore rejected, the mirror rejects, with the
//!     same error;
//!   - every attestation the coordinator accepted, the mirror accepts and
//!     emits the coordinator's log — the same topics and data, byte for
//!     byte — with no spec binding; every one it refused, the mirror
//!     refuses with the same error;
//!   - every wallet's deposits and payouts, per token, are FigaroCore's;
//!   - every process ends on FigaroCore's accumulator and active count.
//!
//! A resolution comes in the stream's two forms. The signed form is the
//! `0x02` entry's. The wallet-code form is the `0x04` entry's, whose check
//! lives in `FigaroBatchVerifier`, never in FigaroCore: the Foundry half
//! builds the entry's bytes (the process, the u16 length, the authorization,
//! the u16 count, the listed orders) followed by an empty `0x02` sentinel,
//! writes down their hash, the authorization's length and the seed of its keccak
//! chain (see `authorization`), hands them to the verifier's own stream reader with the buyer's account
//! carrying code that validates exactly the authorization for the
//! `ResolveProcess` digest over the listed payments' sum, and writes down the
//! reader's answer, the sum and the events it published. Here each such step
//! asserts the guest's encoder writes bytes of the same hash, its decoder reads back
//! the same process, authorization, orders and sum, the reader resolved the
//! same order hashes and stopped where the sentinel starts; and the mirror
//! applies the step as `KernelOp::ResolveByWalletCode`, whose outcome joined
//! with the reader's (the buyer's code refuses an authorization the buyer
//! did not give) must be FigaroCore's.
//!
//! An attestation comes in two forms likewise. The signed form is in public
//! value 6. The wallet-code form is the `0x05` entry's, whose check is the
//! attesting party's code, asked by `FigaroBatchVerifier`: the Foundry half
//! builds the entry (the role, the target, the clause id, the stage, the
//! content reference, the u16 length, the authorization) followed by a
//! sentinel `0x05` entry its party's code validates, hands them to the
//! verifier's reader with the role's party carrying code that validates
//! exactly the authorization for the role's digest when the caller is the
//! party, and writes down the reader's answer (the entry's `Attestation`
//! emitted, or the walk refused by name) and the event it emitted. Here each such
//! step asserts the guest's encoder writes bytes of the same hash, its decoder
//! reads back the same entries, re-encoding them gives back the bytes, the
//! emitted event is the one the mirror derives under the reader's domain, and
//! the mirror's outcome joined with the reader's (the party's code refuses an
//! authorization the party did not give) is the coordinator's.
//!
//! The commit signatures are the stream's own bytes, so a signature form the
//! FigaroCore refuses (high-s, a 0/1 recovery id, zero bytes) reaches the mirror
//! as FigaroCore saw it. A resolution has no signature on the direct path
//! (FigaroCore reads `msg.sender`); the mirror's equivalent is the caller's
//! signature over the resolve struct, made here with the caller's key; an
//! attestation's caller likewise signs the attest struct here.
//!
//! The test is `#[ignore]`d because it needs the stream the Foundry half
//! writes; `scripts/test-cross-impl-fuzz.sh` runs both halves under one seed.
//! Run alone, a missing stream is a failure, never a skip.
use std::collections::BTreeMap;
use std::str::FromStr;

use alloy_primitives::{keccak256, Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{apply_batch_with_state, derive_commitment_ids};
use figaro_kernel::operation_stream::{decode_operation_stream, encode_operation_stream, encode_stream_parts};
use figaro_kernel::state::KernelState;
use figaro_kernel::types::*;

/// The Foundry half's keyring.
const KEYS: [u64; 5] = [0xB0B, 0x5E11, 0x5E12, 0x5E13, 0xB0B2];

fn stream() -> Vec<serde_json::Value> {
    let path = std::env::var("KERNEL_FUZZ_STREAM").map(std::path::PathBuf::from).unwrap_or_else(|_| {
        let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        p.pop(); // prover/
        p.pop(); // repo root
        p.push("test/fixtures/streams/kernel.jsonl");
        p
    });
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "read {}: {e} — run scripts/test-cross-impl-fuzz.sh, which writes the stream first",
            path.display()
        )
    });
    text.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| serde_json::from_str(l).expect("stream line is JSON"))
        .collect()
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
fn count(v: &serde_json::Value) -> usize {
    s(v).parse().expect("count")
}

fn signature(v: &serde_json::Value) -> Signature {
    let hex = s(v).trim_start_matches("0x");
    let bytes: Vec<u8> = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hex"))
        .collect();
    assert_eq!(bytes.len(), 65, "a stream signature is 65 bytes");
    Signature {
        r: B256::from_slice(&bytes[..32]),
        s: B256::from_slice(&bytes[32..64]),
        v: bytes[64],
    }
}

fn words(v: &serde_json::Value) -> Vec<B256> {
    v.as_array().expect("array").iter().map(b256).collect()
}

fn hex_bytes(v: &serde_json::Value) -> Vec<u8> {
    let hex = s(v).trim_start_matches("0x");
    (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hex")).collect()
}

/// The `Attestation` event as the EVM logs it: the signature and the three
/// indexed words as topics, the three unindexed words as data.
fn encode_log(e: &AttestationEventData) -> (Vec<B256>, Vec<u8>) {
    let signature = keccak256(b"Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)");
    let mut attester = [0u8; 32];
    attester[12..].copy_from_slice(e.attester.as_slice());
    let mut data = Vec::with_capacity(96);
    data.extend_from_slice(e.clause_id.as_slice());
    let mut stage = [0u8; 32];
    stage[31] = e.stage;
    data.extend_from_slice(&stage);
    data.extend_from_slice(e.content_ref.as_slice());
    (vec![signature, e.order_hash, e.process_id, B256::from(attester)], data)
}

fn make_signing_key(secret: u64) -> SigningKey {
    let mut bytes = [0u8; 32];
    bytes[24..].copy_from_slice(&secret.to_be_bytes());
    SigningKey::from_bytes((&bytes).into()).unwrap()
}

fn key_address(key: &SigningKey) -> Address {
    let pubkey = key.verifying_key().to_encoded_point(false);
    Address::from_slice(&keccak256(&pubkey.as_bytes()[1..])[12..])
}

fn sign_digest(key: &SigningKey, digest: &B256) -> Signature {
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

fn commitment(o: &serde_json::Value) -> Commitment {
    Commitment {
        process_id: b256(&o["commitmentProcessId"]),
        buyer: addr(&o["buyer"]),
        seller: addr(&o["seller"]),
        currency: addr(&o["currency"]),
        payment: u256(&o["payment"]),
        expected_cumulative_value: u256(&o["expectedCumulativeValue"]),
        checkout_hash: b256(&o["checkoutHash"]),
        salt: u256(&o["salt"]),
        deadline: u256(&o["deadline"]),
    }
}

/// The process id of the empty `0x02` entry the Foundry half writes after
/// every wallet-code entry, so the reader's offset past the entry is
/// observed: `keccak256("figaro-fuzz-sentinel")`.
fn sentinel_process_id() -> B256 {
    keccak256(b"figaro-fuzz-sentinel")
}

/// A wallet-code step's authorization, as the Foundry half draws it: a
/// keccak chain from the seed, word k `keccak256` of word k-1 and word 0
/// `keccak256` of the seed, the last word cut at the length.
fn authorization(step: &serde_json::Value) -> Vec<u8> {
    let len = count(&step["authorizationLength"]);
    let mut fill = b256(&step["authorizationSeed"]);
    let mut out = Vec::with_capacity(len + 32);
    while out.len() < len {
        fill = keccak256(fill);
        out.extend_from_slice(fill.as_slice());
    }
    out.truncate(len);
    out
}

/// The Foundry half's sentinel `0x05` entry: a seller's attestation on a
/// fixed order with no authorization, which its seller's code validates.
fn sentinel_attestation() -> KernelOp {
    KernelOp::AttestByWalletCode {
        role: AttesterRole::Seller,
        target: Commitment {
            process_id: sentinel_process_id(),
            buyer: Address::from_str("0x000000000000000000000000000000000000b0b5").unwrap(),
            seller: Address::from_str("0x0000000000000000000000000000000000005e57").unwrap(),
            currency: Address::ZERO,
            payment: U256::ZERO,
            expected_cumulative_value: U256::ZERO,
            checkout_hash: B256::ZERO,
            salt: U256::ZERO,
            deadline: U256::ZERO,
        },
        clause_id: keccak256(b"figaro-fuzz-sentinel-clause"),
        stage: 0,
        content_ref: B256::ZERO,
        authorization: Default::default(),
        proof: AttestationWitness::HashOnly { clause_data_hash: B256::ZERO, inclusion_proof: vec![] },
    }
}

/// The codec of one wallet-code attestation step against the verifier's
/// reading of the same bytes (see the module doc), and the event the reader
/// emitted against the one the mirror derives under the reader's domain.
fn check_wallet_code_attestation_codec(
    i: usize,
    step: &serde_json::Value,
    op: &KernelOp,
    reader_domain: &B256,
    divergences: &mut Vec<String>,
) {
    let ops = vec![op.clone(), sentinel_attestation()];
    let bytes = encode_operation_stream(&ops, &[]);
    if keccak256(&bytes) != b256(&step["walletCodeStreamHash"]) {
        divergences.push(format!("step {i}: the guest's encoder writes other attestation bytes than the verifier read"));
        return;
    }
    match decode_operation_stream(&bytes) {
        Ok((decoded, entries, claims)) => {
            if !decoded.is_empty() || !claims.is_empty() || entries.len() != 2 {
                divergences.push(format!("step {i}: the guest's decoder read other entries than the entry and its sentinel"));
            } else if encode_stream_parts(&decoded, &entries, &claims) != bytes {
                divergences.push(format!("step {i}: re-encoding the decoded entries gives other bytes"));
            }
        }
        Err(e) => divergences.push(format!("step {i}: the guest's decoder refused the verifier's bytes: {e}")),
    }
    let KernelOp::AttestByWalletCode { role, target, clause_id, stage, content_ref, .. } = op else {
        unreachable!("a wallet-code attestation")
    };
    if s(&step["walletCodeOutcome"]) == "emitted" {
        let (order_hash, process_id) = derive_commitment_ids(reader_domain, target);
        let expected = encode_log(&AttestationEventData {
            order_hash,
            process_id,
            attester: role.party(target),
            clause_id: *clause_id,
            stage: *stage,
            content_ref: *content_ref,
        });
        if expected != (words(&step["walletCodeTopics"]), hex_bytes(&step["walletCodeData"])) {
            divergences.push(format!("step {i}: the verifier emitted another Attestation than the mirror derives"));
        }
    }
}

/// The codec of one wallet-code resolve step against the verifier's reading
/// of the same bytes (see the module doc). Returns the decoded cumulative
/// value, the listed payments' sum.
fn check_wallet_code_codec(
    i: usize,
    step: &serde_json::Value,
    process_id: &B256,
    commitments: &[Commitment],
    authorization: &[u8],
    divergences: &mut Vec<String>,
) -> Option<U256> {
    let zero_sig = Signature {
        v: 0,
        r: B256::ZERO,
        s: B256::ZERO,
    };
    let ops = vec![
        KernelOp::ResolveByWalletCode {
            process_id: *process_id,
            cumulative_value: U256::ZERO,
            commitments: commitments.to_vec(),
            authorization: authorization.to_vec().into(),
        },
        KernelOp::Resolve {
            process_id: sentinel_process_id(),
            cumulative_value: U256::ZERO,
            commitments: vec![],
            buyer_sig: zero_sig,
        },
    ];
    // The guest's bytes, of the hash of the bytes the verifier read: equal
    // bytes, so decoding them decodes what the verifier read.
    let bytes = encode_operation_stream(&ops, &[]);
    if keccak256(&bytes) != b256(&step["walletCodeStreamHash"]) {
        divergences.push(format!("step {i}: the guest's encoder writes other bytes than the verifier read"));
        return None;
    }
    let sum = u256(&step["walletCodeSum"]);
    let decoded = match decode_operation_stream(&bytes) {
        Ok((ops, entries, claims)) if claims.is_empty() && entries.is_empty() => ops,
        Ok(_) => {
            divergences.push(format!("step {i}: the guest's decoder read a usage claim or a wallet-code attestation"));
            return None;
        }
        Err(e) => {
            divergences.push(format!("step {i}: the guest's decoder refused the verifier's bytes: {e}"));
            return None;
        }
    };
    let hashes = |cs: &[Commitment]| cs.iter().map(commitment_struct_hash).collect::<Vec<_>>();
    let mut decoded_value = None;
    match decoded.as_slice() {
        [KernelOp::ResolveByWalletCode {
            process_id: p,
            cumulative_value,
            commitments: cs,
            authorization: a,
        }, KernelOp::Resolve {
            process_id: sentinel,
            commitments: none,
            ..
        }] => {
            if p != process_id || a.as_ref() != authorization || hashes(cs) != hashes(commitments) {
                divergences.push(format!("step {i}: the guest's decoder read another entry than was written"));
            }
            if *cumulative_value != sum {
                divergences.push(format!(
                    "step {i}: the guest's decoder derives {cumulative_value}, the verifier summed {sum}"
                ));
            }
            if *sentinel != sentinel_process_id() || !none.is_empty() {
                divergences.push(format!("step {i}: the guest's decoder did not stop where the sentinel starts"));
            }
            decoded_value = Some(*cumulative_value);
        }
        other => divergences.push(format!("step {i}: the guest's decoder read {} entries, not the entry and its sentinel", other.len())),
    }
    if s(&step["walletCodeOutcome"]) == "ok" {
        let expected: Vec<B256> = commitments
            .iter()
            .map(|c| compute_order_hash(process_id, &commitment_struct_hash(c)))
            .collect();
        if words(&step["walletCodeOrderHashes"]) != expected {
            divergences.push(format!("step {i}: the verifier resolved other orders than the entry lists"));
        }
        if commitments.first().map(|c| c.buyer) != Some(addr(&step["walletCodeBuyer"]))
            || count(&step["walletCodeCount"]) != commitments.len()
        {
            divergences.push(format!("step {i}: the verifier's ProcessResolved names another buyer or count"));
        }
    }
    decoded_value
}

/// The mirror's error under FigaroCore's name. FigaroCore reports arithmetic
/// overflow as a Solidity panic and a malformed signature through
/// OpenZeppelin's ECDSA errors; every other name is FigaroCore's own.
fn kernel_name(e: &KernelError) -> &'static str {
    match e {
        KernelError::DeadlineExpired => "DeadlineExpired",
        KernelError::InvalidBuyerSignature => "InvalidBuyerSignature",
        KernelError::InvalidSellerSignature => "InvalidSellerSignature",
        KernelError::ZeroPayment => "ZeroPayment",
        KernelError::ProcessAlreadyExists => "ProcessAlreadyExists",
        KernelError::UnknownProcess => "UnknownProcess",
        KernelError::CumulativeValueMismatch { .. } => "CumulativeValueMismatch",
        KernelError::NotProcessBuyer => "NotProcessBuyer",
        KernelError::CurrencyMismatch => "CurrencyMismatch",
        KernelError::OrderNotCommitted(_) => "OrderNotCommitted",
        KernelError::NoActiveOrders => "NoActiveOrders",
        KernelError::IncompleteOrderList { .. } => "IncompleteOrderList",
        KernelError::DuplicateCommitment => "DuplicateCommitment",
        KernelError::InvalidRootCumulativeValue => "InvalidRootCumulativeValue",
        KernelError::ProcessAlreadyResolved => "ProcessAlreadyResolved",
        KernelError::Overflow => "Panic",
        KernelError::InvalidSignature => "ECDSAInvalidSignature",
        KernelError::UnknownOrder => "UnknownOrder",
        KernelError::OrderResolved => "OrderResolved",
        KernelError::NotAuthorized => "NotAuthorized",
        KernelError::InvalidInclusionProof => "InvalidInclusionProof",
        _ => "outside the kernel",
    }
}

/// FigaroCore's three ECDSA errors are one class to the mirror, which has
/// one `InvalidSignature`.
fn same_error(kernel: &str, mirror: &str) -> bool {
    if kernel.starts_with("ECDSAInvalidSignature") {
        return mirror == "ECDSAInvalidSignature";
    }
    kernel == mirror
}

#[test]
#[ignore = "needs the stream the Foundry half writes; run scripts/test-cross-impl-fuzz.sh"]
fn the_mirror_answers_every_operation_as_the_kernel_did() {
    let lines = stream();
    let header = lines
        .iter()
        .find(|l| s(&l["type"]) == "header")
        .expect("the stream opens on a header");
    let seed = s(&header["seed"]).to_string();
    let chain_id: u64 = s(&header["chainId"]).parse().unwrap();
    let core = addr(&header["verifyingContract"]);
    let domain = domain_separator(chain_id, core);
    let keys: BTreeMap<Address, SigningKey> = KEYS
        .into_iter()
        .map(make_signing_key)
        .map(|k| (key_address(&k), k))
        .collect();

    let mut steps: Vec<&serde_json::Value> =
        lines.iter().filter(|l| s(&l["type"]) == "step").collect();
    steps.sort_by_key(|l| count(&l["index"]));
    assert_eq!(steps.len(), count(&header["stepCount"]), "every step is in the stream");

    let mut state = KernelState::new();
    let mut committed: BTreeMap<usize, Commitment> = BTreeMap::new();
    let mut deposits: BTreeMap<(Address, Address), U256> = BTreeMap::new();
    let mut payouts: BTreeMap<(Address, Address), U256> = BTreeMap::new();
    let mut divergences: Vec<String> = Vec::new();
    let (mut accepted, mut rejected, mut attestations) = (0usize, 0usize, 0usize);
    let (mut wallet_code_accepted, mut wallet_code_refused) = (0usize, 0usize);
    let mut wallet_code_attestations = 0usize;
    let reader_domain = domain_separator(chain_id, addr(&header["readerContract"]));

    for step in steps {
        let i = count(&step["index"]);
        let kind = s(&step["kind"]);
        let outcome = s(&step["outcome"]);

        let wallet_code = kind == "resolve" && step.get("form").map(s) == Some("walletCode");
        let wallet_code_attest = kind.starts_with("attest") && step.get("form").map(s) == Some("walletCode");
        let mut wallet_code_value: Option<U256> = None;
        let mut applied_value = U256::ZERO;
        let op = match kind {
            "commit" => KernelOp::Commit {
                commitment: commitment(step),
                buyer_sig: signature(&step["buyerSig"]),
                seller_sig: signature(&step["sellerSig"]),
            },
            "resolve" => {
                let process_id = b256(&step["processId"]);
                let caller = addr(&step["caller"]);
                let commitments: Vec<Commitment> = (0..count(&step["orderCount"]))
                    .map(|k| committed[&count(&step[format!("r{k}")])].clone())
                    .collect();
                // The buyer signs over the process as it stands: its
                // cumulative value in the mirror's state (zero for a
                // process the mirror never saw).
                let cumulative_value = state
                    .full_processes()
                    .unwrap()
                    .get(&process_id)
                    .map(|p| p.cumulative_value)
                    .unwrap_or(U256::ZERO);
                applied_value = cumulative_value;
                if wallet_code {
                    let authorization = authorization(step);
                    wallet_code_value =
                        check_wallet_code_codec(i, step, &process_id, &commitments, &authorization, &mut divergences);
                    KernelOp::ResolveByWalletCode {
                        process_id,
                        cumulative_value,
                        commitments,
                        authorization: authorization.into(),
                    }
                } else {
                    let digest = typed_data_hash(&domain, &resolve_struct_hash(&process_id, &cumulative_value));
                    KernelOp::Resolve {
                        process_id,
                        cumulative_value,
                        commitments,
                        buyer_sig: sign_digest(&keys[&caller], &digest),
                    }
                }
            }
            "attestAsSeller" | "attestAsBuyer" => {
                let target = commitment(step);
                let (order_hash, process_id) = derive_commitment_ids(&domain, &target);
                let clause_id = b256(&step["clauseId"]);
                let stage: u8 = s(&step["stage"]).parse().unwrap();
                let content_ref = b256(&step["contentRef"]);
                let key = &keys[&addr(&step["caller"])];
                let proof = AttestationWitness::HashOnly {
                    clause_data_hash: b256(&step["clauseDataHash"]),
                    inclusion_proof: words(&step["inclusionProof"]),
                };
                if wallet_code_attest {
                    let op = KernelOp::AttestByWalletCode {
                        role: if kind == "attestAsSeller" { AttesterRole::Seller } else { AttesterRole::Buyer },
                        target,
                        clause_id,
                        stage,
                        content_ref,
                        authorization: authorization(step).into(),
                        proof,
                    };
                    check_wallet_code_attestation_codec(i, step, &op, &reader_domain, &mut divergences);
                    op
                } else if kind == "attestAsSeller" {
                    let h = attest_seller_struct_hash(&order_hash, &clause_id, stage, &content_ref);
                    KernelOp::AttestAsSeller {
                        target,
                        clause_id,
                        stage,
                        content_ref,
                        seller_sig: sign_digest(key, &typed_data_hash(&domain, &h)),
                        proof,
                    }
                } else {
                    let h = attest_buyer_struct_hash(&process_id, &order_hash, &clause_id, stage, &content_ref);
                    KernelOp::AttestAsBuyer {
                        target,
                        clause_id,
                        stage,
                        content_ref,
                        buyer_sig: sign_digest(key, &typed_data_hash(&domain, &h)),
                        proof,
                    }
                }
            }
            other => panic!("seed {seed}, step {i}: unknown kind {other}"),
        };

        let input = BatchInput {
            chain_id,
            verifying_contract: core,
            block_timestamp: s(&step["timestamp"]).parse().unwrap(),
            operations: vec![op],
            prev_state: state.to_snapshot(),
            usage_claims: vec![],
            usage_period: 0,
        };

        // A wallet-code resolve the mirror applies lands only if the
        // verifier's reader, asking the buyer's code, accepts its entry.
        // A wallet-code attestation the mirror applies is emitted only if the
        // verifier's reader, asking the party's code, emits it.
        let verifier = if wallet_code {
            s(&step["walletCodeOutcome"])
        } else if wallet_code_attest {
            match s(&step["walletCodeOutcome"]) {
                "emitted" => "ok",
                other => other,
            }
        } else {
            "ok"
        };
        match (apply_batch_with_state(&input), outcome) {
            (Ok(_), kernel_error) if verifier != "ok" => {
                rejected += 1;
                wallet_code_refused += 1;
                let joined = if wallet_code_attest {
                    kernel_error == "NotAuthorized" && verifier == "WalletCodeAttestationRefused"
                } else {
                    kernel_error == "NotProcessBuyer" && verifier == "WalletCodeAuthorizationRefused"
                };
                if !joined {
                    divergences.push(format!(
                        "step {i} ({kind}, wallet-code form): the kernel answered {kernel_error}, the verifier's reader answered {verifier}"
                    ));
                }
            }
            (Ok((_pv, positions, events, next)), "ok") => {
                if wallet_code {
                    wallet_code_accepted += 1;
                    // An applied resolve lists every order of its process, so
                    // the value the stream leaves out is the payments' sum.
                    if wallet_code_value != Some(applied_value) {
                        divergences.push(format!(
                            "step {i}: the applied value is not the listed payments' sum the decoder derives"
                        ));
                    }
                }
                accepted += 1;
                if wallet_code_attest {
                    attestations += 1;
                    wallet_code_attestations += 1;
                    if !events.attestations.is_empty() {
                        divergences.push(format!("step {i} ({kind}): the wallet-code form put an event in public value 6"));
                    }
                } else if kind.starts_with("attest") {
                    attestations += 1;
                    match events.attestations.as_slice() {
                        [e] => {
                            let (topics, data) = encode_log(e);
                            if topics != words(&step["topics"]) || data != hex_bytes(&step["data"]) {
                                divergences.push(format!("step {i} ({kind}): the event bytes differ from the coordinator's"));
                            }
                        }
                        other => divergences.push(format!("step {i} ({kind}): {} events, the coordinator emitted one", other.len())),
                    }
                    if !events.spec_bindings.is_empty() {
                        divergences.push(format!("step {i} ({kind}): a hash-only attestation committed a spec binding"));
                    }
                }
                if kind == "commit" {
                    let c = commitment(step);
                    let (order_hash, process_id) = derive_commitment_ids(&domain, &c);
                    if process_id != b256(&step["processId"]) {
                        divergences.push(format!("step {i}: process id differs"));
                    }
                    if order_hash != b256(&step["orderHash"]) {
                        divergences.push(format!("step {i}: order hash differs"));
                    }
                    committed.insert(i, c);
                }
                for p in positions {
                    *deposits.entry((p.token, p.user)).or_default() += p.deposit;
                    *payouts.entry((p.token, p.user)).or_default() += p.payout;
                }
                state = next;
            }
            (Ok(_), kernel_error) => divergences.push(format!(
                "step {i} ({kind}): the kernel rejected with {kernel_error}, the mirror ACCEPTED"
            )),
            (Err(e), "ok") => divergences.push(format!(
                "step {i} ({kind}): the kernel accepted, the mirror rejected with {e}"
            )),
            (Err(e), kernel_error) => {
                rejected += 1;
                if !same_error(kernel_error, kernel_name(&e)) {
                    divergences.push(format!(
                        "step {i} ({kind}): the kernel rejected with {kernel_error}, the mirror with {e}"
                    ));
                }
            }
        }
    }

    for party in lines.iter().filter(|l| s(&l["type"]) == "party") {
        let key = (addr(&party["token"]), addr(&party["address"]));
        let deposit = deposits.get(&key).copied().unwrap_or_default();
        let payout = payouts.get(&key).copied().unwrap_or_default();
        if deposit != u256(&party["deposit"]) {
            divergences.push(format!("{key:?}: deposits {deposit}, the kernel pulled {}", s(&party["deposit"])));
        }
        if payout != u256(&party["payout"]) {
            divergences.push(format!("{key:?}: payouts {payout}, the kernel paid {}", s(&party["payout"])));
        }
    }

    let mut processes = 0usize;
    for process in lines.iter().filter(|l| s(&l["type"]) == "process") {
        processes += 1;
        let pid = b256(&process["processId"]);
        match state.full_processes().unwrap().get(&pid) {
            None => divergences.push(format!("process {pid}: missing from the mirror")),
            Some(ps) => {
                if ps.cumulative_value != u256(&process["cumulativeValue"]) {
                    divergences.push(format!("process {pid}: cumulative value differs"));
                }
                if ps.active_order_count != s(&process["activeOrderCount"]).parse::<u64>().unwrap() {
                    divergences.push(format!("process {pid}: active order count differs"));
                }
            }
        }
    }
    if state.full_processes().unwrap().len() != processes {
        divergences.push(format!(
            "the mirror holds {} processes, the kernel {processes}",
            state.full_processes().unwrap().len()
        ));
    }

    assert!(accepted > 0 && rejected > 0, "seed {seed}: the stream exercises both outcomes");
    assert!(attestations > 0, "seed {seed}: the stream holds accepted attestations");
    assert!(
        wallet_code_accepted > 0,
        "seed {seed}: the stream holds accepted wallet-code resolves (0x04)"
    );
    assert!(
        wallet_code_attestations > 0,
        "seed {seed}: the stream holds accepted wallet-code attestations (0x05)"
    );
    assert!(
        divergences.is_empty(),
        "seed {seed}: {} divergences between the kernel and its mirror:\n{}",
        divergences.len(),
        divergences.join("\n")
    );
    println!(
        "seed {seed}: {accepted} accepted ({attestations} attestations, {wallet_code_attestations} in the wallet-code form, {wallet_code_accepted} wallet-code resolves), {rejected} rejected ({wallet_code_refused} by the party's code), {processes} processes — no divergence"
    );
}
