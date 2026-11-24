//! The operation stream: the bytes a batch publishes in the transaction that
//! lands it, so the state behind its root is rebuilt from the chain alone.
//! Round trip, the hash the guest commits, the kind byte, and the decoder's
//! refusals; the round trip also as a property over generated streams.

use alloy_primitives::{keccak256, Address, B256, U256};
use figaro_kernel::kernel::apply_batch;
use figaro_kernel::operation_stream::{
    compute_operations_hash, decode_operation_stream, encode_operation_stream, encode_stream_parts,
    resolved_running_total, wallet_code_attestations, COMMITMENT_BYTES, SIGNATURE_BYTES,
};
use figaro_kernel::state::KernelState;
use figaro_kernel::types::{
    AttestationWitness, AttesterRole, BatchInput, Commitment, KernelOp, Signature, UsageClaim,
    UsageClaimKind, USAGE_KIND_AGREEMENT, USAGE_KIND_CLAUSE, USAGE_KIND_PROCESS,
};

fn commitment(seed: u8) -> Commitment {
    Commitment {
        process_id: B256::repeat_byte(seed),
        buyer: Address::repeat_byte(0x10 + seed),
        seller: Address::repeat_byte(0x20 + seed),
        token: Address::repeat_byte(0x30 + seed),
        payment: U256::from(100u64 * seed as u64),
        running_total: U256::from(300u64 * seed as u64),
        checkout_hash: B256::repeat_byte(0x40 + seed),
        salt: U256::from(seed),
        commit_deadline: U256::from(1_700_000_000u64 + seed as u64),
    }
}

fn signature(seed: u8) -> Signature {
    Signature {
        v: 27 + (seed % 2),
        r: B256::repeat_byte(0x50 + seed),
        s: B256::repeat_byte(0x60 + seed),
    }
}

fn attestation(seed: u8) -> KernelOp {
    KernelOp::AttestAsSeller {
        target: commitment(seed),
        clause_id: B256::repeat_byte(0x70),
        stage: 0,
        content_ref: B256::repeat_byte(0x71),
        seller_sig: signature(seed),
        proof: AttestationWitness {
            clause_data_hash: B256::repeat_byte(0x74),
            inclusion_proof: vec![],
        },
    }
}

fn sample() -> (Vec<KernelOp>, Vec<UsageClaim>) {
    let ops = vec![
        KernelOp::Commit {
            commitment: commitment(1),
            buyer_sig: signature(1),
            seller_sig: signature(2),
        },
        attestation(1),
        KernelOp::Commit {
            commitment: commitment(2),
            buyer_sig: signature(3),
            seller_sig: signature(4),
        },
        KernelOp::Resolve {
            process_id: B256::repeat_byte(0x01),
            // The sum of the listed payments, 100 + 200.
            running_total: U256::from(300u64),
            commitments: vec![commitment(1), commitment(2)],
            buyer_sig: signature(5),
        },
    ];
    let claims = vec![
        UsageClaim {
            order: commitment(1),
            clause_or_process: B256::repeat_byte(0x80),
            kind: UsageClaimKind::Clause {
                clause_data_hash: B256::repeat_byte(0x81),
            },
            inclusion_proof: vec![B256::repeat_byte(0x82), B256::repeat_byte(0x83)],
        },
        UsageClaim {
            order: commitment(2),
            clause_or_process: B256::repeat_byte(0x90),
            kind: UsageClaimKind::Agreement {
                process_design_hash: B256::repeat_byte(0x91),
            },
            inclusion_proof: vec![],
        },
        UsageClaim {
            order: commitment(2),
            clause_or_process: B256::repeat_byte(0xa0),
            kind: UsageClaimKind::Process {
                agreement_hash: B256::repeat_byte(0xa1),
                agreement_content_hash: B256::repeat_byte(0xa2),
                membership_proof: vec![B256::repeat_byte(0xa3)],
            },
            inclusion_proof: vec![B256::repeat_byte(0xa4)],
        },
    ];
    (ops, claims)
}

#[test]
fn the_stream_round_trips_and_skips_attestations() {
    let (ops, claims) = sample();
    let bytes = encode_operation_stream(&ops, &claims);
    // Two commits, one resolve naming two commitments, three claims; no
    // attestation entry.
    let commit_len = 1 + COMMITMENT_BYTES + 2 * SIGNATURE_BYTES;
    let resolve_len = 1 + 32 + SIGNATURE_BYTES + 2 + 2 * COMMITMENT_BYTES;
    let claim_clause = 1 + COMMITMENT_BYTES + 32 + 1 + 32 + 2 + 2 * 32;
    let claim_agreement = 1 + COMMITMENT_BYTES + 32 + 1 + 32 + 2;
    let claim_assembly = 1 + COMMITMENT_BYTES + 32 + 1 + 64 + 2 + 32 + 2 + 32;
    assert_eq!(
        bytes.len(),
        2 * commit_len + resolve_len + claim_clause + claim_agreement + claim_assembly
    );
    let (ops2, _, claims2) = decode_operation_stream(&bytes).expect("decodes");
    assert_eq!(ops2.len(), 3, "the attestation is not in the stream");
    assert_eq!(claims2.len(), 3);
    assert_eq!(
        encode_operation_stream(&ops2, &claims2),
        bytes,
        "re-encoding is the identity"
    );
    match &ops2[2] {
        KernelOp::Resolve {
            process_id,
            running_total,
            commitments,
            buyer_sig,
        } => {
            assert_eq!(*process_id, B256::repeat_byte(0x01));
            assert_eq!(
                *running_total,
                U256::from(300u64),
                "the decoder derives the signed value from the listed payments"
            );
            assert_eq!(commitments.len(), 2);
            assert_eq!(commitments[1].seller, commitment(2).seller);
            assert_eq!(buyer_sig.v, signature(5).v);
        }
        other => panic!("expected a resolve, got {other:?}"),
    }
    match &claims2[2].kind {
        UsageClaimKind::Process {
            membership_proof, ..
        } => assert_eq!(membership_proof, &vec![B256::repeat_byte(0xa3)]),
        other => panic!("expected an assembly claim, got {other:?}"),
    }
    // The kind byte is the chain's family code: the byte after the claim's
    // commitment and key.
    let claim_offset = 2 * commit_len + resolve_len;
    assert_eq!(
        bytes[claim_offset + 1 + COMMITMENT_BYTES + 32],
        USAGE_KIND_CLAUSE
    );
    assert_eq!(
        bytes[claim_offset + claim_clause + 1 + COMMITMENT_BYTES + 32],
        USAGE_KIND_AGREEMENT
    );
    assert_eq!(
        bytes[claim_offset + claim_clause + claim_agreement + 1 + COMMITMENT_BYTES + 32],
        USAGE_KIND_PROCESS
    );
}

#[test]
fn the_hash_is_keccak_of_the_bytes_and_the_empty_stream_hashes_to_keccak_empty() {
    let (ops, claims) = sample();
    let bytes = encode_operation_stream(&ops, &claims);
    assert_eq!(compute_operations_hash(&bytes), keccak256(&bytes));
    assert_eq!(compute_operations_hash(&[]), keccak256([]));
    assert!(encode_operation_stream(&[], &[]).is_empty());
    assert!(
        encode_operation_stream(&[attestation(1)], &[]).is_empty(),
        "attestations alone leave an empty stream"
    );
}

#[test]
fn the_decoder_refuses_a_truncated_stream_an_unknown_tag_and_a_claim_before_an_operation() {
    let (ops, claims) = sample();
    let bytes = encode_operation_stream(&ops, &claims);
    assert!(
        decode_operation_stream(&bytes[..bytes.len() - 1]).is_err(),
        "one byte short"
    );
    assert!(decode_operation_stream(&[0x09]).is_err(), "unknown tag");
    let mut swapped = encode_operation_stream(&[], &claims[..1]);
    swapped.extend(encode_operation_stream(&ops[..1], &[]));
    assert!(
        decode_operation_stream(&swapped).is_err(),
        "a commit after a claim"
    );
    let mut trailing = bytes.clone();
    trailing.push(0x00);
    assert!(
        decode_operation_stream(&trailing).is_err(),
        "a trailing byte is an unknown tag"
    );
}

/// The stream is exact-width and has no funding entry: a commit entry
/// followed by a funding leg (a router, a token in and an amount, as ABI
/// words, so its first byte is zero) does not decode, nor does one led by any
/// byte at all when the leg is filled with a byte no length prefix can satisfy.
/// The bytes after a commit can only be another of the five entries.
#[test]
fn a_commit_followed_by_a_funding_leg_does_not_decode() {
    let commit = encode_operation_stream(
        &[KernelOp::Commit {
            commitment: commitment(1),
            buyer_sig: signature(1),
            seller_sig: signature(2),
        }],
        &[],
    );
    assert_eq!(commit.len(), 1 + COMMITMENT_BYTES + 2 * SIGNATURE_BYTES);
    assert!(
        decode_operation_stream(&commit).is_ok(),
        "the commit alone decodes"
    );

    let mut abi_leg = Vec::new();
    abi_leg.extend_from_slice(&[0u8; 12]);
    abi_leg.extend_from_slice(Address::repeat_byte(0x5a).as_slice());
    abi_leg.extend_from_slice(&[0u8; 12]);
    abi_leg.extend_from_slice(Address::repeat_byte(0x7e).as_slice());
    abi_leg.extend_from_slice(&U256::from(10u64).pow(U256::from(21u64)).to_be_bytes::<32>());
    let mut with_abi_leg = commit.clone();
    with_abi_leg.extend_from_slice(&abi_leg);
    assert!(
        decode_operation_stream(&with_abi_leg).is_err(),
        "a commit followed by an ABI-encoded funding leg"
    );

    for lead in 0..=u8::MAX {
        let mut stream = commit.clone();
        stream.push(lead);
        stream.extend_from_slice(&[0xab; 95]);
        assert!(
            decode_operation_stream(&stream).is_err(),
            "a commit followed by a 96-byte leg led by 0x{lead:02x}"
        );
    }
}

#[test]
fn a_batch_of_nothing_commits_the_empty_stream_hash_as_word_eight() {
    let input = BatchInput {
        chain_id: 31337,
        verifying_contract: Address::repeat_byte(0xee),
        block_timestamp: 1_700_000_000,
        operations: vec![],
        prev_state: KernelState::new().to_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };
    let (pv, _, _) = apply_batch(&input).expect("an empty batch applies");
    assert_eq!(pv.operations_hash, keccak256([]));
    let abi = pv.abi_encode();
    assert_eq!(abi.len(), 288);
    assert_eq!(
        &abi[256..288],
        pv.operations_hash.as_slice(),
        "word eight is the operations hash"
    );
}

/// A wallet-code resolve is its own entry, `0x04 processId len(2)
/// authorization count(2) commitment*`, and round-trips with its bytes: the
/// verifier reads the authorization from it and the rebuild replays it.
#[test]
fn a_wallet_code_resolve_round_trips_with_its_authorization() {
    let ops = vec![KernelOp::ResolveByWalletCode {
        process_id: B256::repeat_byte(0x01),
        running_total: U256::from(300u64),
        commitments: vec![commitment(1), commitment(2)],
        authorization: alloy_primitives::Bytes::from(vec![0xab; 97]),
    }];
    let bytes = encode_operation_stream(&ops, &[]);
    assert_eq!(bytes.len(), 1 + 32 + 2 + 97 + 2 + 2 * COMMITMENT_BYTES);
    assert_eq!(bytes[0], 0x04, "the wallet-code resolve's tag");
    let (ops2, _, _) = decode_operation_stream(&bytes).expect("decodes");
    assert_eq!(
        encode_operation_stream(&ops2, &[]),
        bytes,
        "re-encoding is the identity"
    );
    match &ops2[0] {
        KernelOp::ResolveByWalletCode {
            running_total,
            authorization,
            ..
        } => {
            assert_eq!(
                *running_total,
                U256::from(300u64),
                "derived from the listed payments"
            );
            assert_eq!(authorization.len(), 97);
        }
        other => panic!("expected the wallet-code resolve, got {other:?}"),
    }
    // A short authorization length is refused, never re-split.
    assert!(decode_operation_stream(&bytes[..1 + 32 + 2 + 50]).is_err());
}

fn wallet_code_attestation(seed: u8, role: AttesterRole, len: usize) -> KernelOp {
    KernelOp::AttestByWalletCode {
        role,
        target: commitment(seed),
        clause_id: B256::repeat_byte(0x72),
        stage: 2,
        content_ref: B256::repeat_byte(0x73),
        authorization: alloy_primitives::Bytes::from(vec![0xcd; len]),
        proof: AttestationWitness {
            clause_data_hash: B256::repeat_byte(0x74),
            inclusion_proof: vec![],
        },
    }
}

/// A wallet-code attestation is its own entry, `0x05 role(1) commitment
/// clauseId(32) stage(1) contentRef(32) len(2) authorization`, written after
/// every commit and resolve and before every usage claim; the decoder returns
/// the entries as their own list, and re-encoding the three lists gives back
/// the same bytes. No fingerprint of the witness enters the stream.
#[test]
fn a_wallet_code_attestation_round_trips_as_its_own_list() {
    let (mut ops, claims) = sample();
    ops.insert(1, wallet_code_attestation(1, AttesterRole::Seller, 97));
    ops.push(wallet_code_attestation(2, AttesterRole::Buyer, 0));
    let bytes = encode_operation_stream(&ops, &claims);
    let (ops2, entries, claims2) = decode_operation_stream(&bytes).expect("decodes");
    assert_eq!(ops2.len(), 3, "the commits and the resolve");
    assert_eq!(claims2.len(), claims.len());
    assert_eq!(entries.len(), 2);
    assert_eq!(
        (entries[0].role, entries[0].authorization.len()),
        (AttesterRole::Seller, 97)
    );
    assert_eq!(
        (entries[1].role, entries[1].authorization.len()),
        (AttesterRole::Buyer, 0)
    );
    assert_eq!(entries[0].stage, 2);
    assert_eq!(
        encode_stream_parts(&ops2, &entries, &claims2),
        bytes,
        "re-encoding is the identity"
    );

    let entry_len = |auth: usize| 1 + 1 + COMMITMENT_BYTES + 32 + 1 + 32 + 2 + auth;
    let without = encode_operation_stream(&sample().0, &[]);
    let with = encode_operation_stream(&ops, &[]);
    assert_eq!(with.len(), without.len() + entry_len(97) + entry_len(0));
    assert_eq!(
        with[without.len()],
        0x05,
        "the entries follow every commit and resolve"
    );
    assert_eq!(with[without.len() + 1], 0x00, "the seller's role byte");
    assert_eq!(
        with[without.len() + entry_len(97) + 1],
        0x01,
        "the buyer's role byte"
    );
    assert!(
        !with
            .windows(32)
            .any(|w| w == B256::repeat_byte(0x74).as_slice()),
        "the witness's clauseDataHash is never published"
    );
}

/// The decoder's order rule: no `0x05` after a usage claim, no commit or
/// resolve after a `0x05`, and a role byte other than the two refused.
#[test]
fn the_decoder_refuses_a_0x05_out_of_place_or_with_an_unknown_role() {
    let (ops, claims) = sample();
    let entry =
        encode_operation_stream(&[wallet_code_attestation(1, AttesterRole::Seller, 3)], &[]);
    let mut after_claim = encode_operation_stream(&[], &claims[..1]);
    after_claim.extend(&entry);
    assert!(
        decode_operation_stream(&after_claim).is_err(),
        "a 0x05 after a claim"
    );
    let mut op_after = entry.clone();
    op_after.extend(encode_operation_stream(&ops[..1], &[]));
    assert!(
        decode_operation_stream(&op_after).is_err(),
        "a commit after a 0x05"
    );
    let mut bad_role = entry.clone();
    bad_role[1] = 0x02;
    assert!(
        decode_operation_stream(&bad_role).is_err(),
        "role byte 0x02"
    );
    assert!(
        decode_operation_stream(&entry[..entry.len() - 1]).is_err(),
        "one byte short"
    );
}

/// A resolve, by signature (`0x02`) or by wallet code (`0x04`), comes before
/// every usage claim and every wallet-code attestation. After a claim alone,
/// or after a wallet-code attestation alone, the decoder refuses it: accepted,
/// its three lists would re-encode with the resolve first, to other bytes
/// than the ones read.
#[test]
fn the_decoder_refuses_a_resolve_after_a_claim_alone_or_a_wallet_code_attestation_alone() {
    let (ops, claims) = sample();
    let by_signature = encode_operation_stream(&ops[3..], &[]);
    assert_eq!(
        by_signature[0], 0x02,
        "the sample's fourth operation is a resolve"
    );
    let by_wallet_code = encode_operation_stream(
        &[KernelOp::ResolveByWalletCode {
            process_id: B256::repeat_byte(0x01),
            running_total: U256::from(300u64),
            commitments: vec![commitment(1), commitment(2)],
            authorization: alloy_primitives::Bytes::from(vec![0xab; 97]),
        }],
        &[],
    );
    assert_eq!(by_wallet_code[0], 0x04);
    let a_claim = encode_operation_stream(&[], &claims[..1]);
    let an_attestation =
        encode_operation_stream(&[wallet_code_attestation(1, AttesterRole::Seller, 3)], &[]);
    for (resolve, form) in [(&by_signature, "0x02"), (&by_wallet_code, "0x04")] {
        assert!(
            decode_operation_stream(resolve).is_ok(),
            "the {form} resolve alone decodes"
        );
        for (before, what) in [
            (&a_claim, "a usage claim"),
            (&an_attestation, "a wallet-code attestation"),
        ] {
            let mut stream = before.clone();
            stream.extend(resolve.iter());
            assert!(
                decode_operation_stream(&stream).is_err(),
                "a {form} resolve after {what} alone"
            );
        }
    }
}

// ── The round trip as a property: decode(encode(x)) == x over generated streams ──

/// A seeded generator (splitmix64), so a failing case is reproduced by its
/// seed alone; the workspace carries no property-testing crate.
struct Gen(u64);

impl Gen {
    fn u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }
    fn below(&mut self, n: u64) -> u64 {
        self.u64() % n
    }
    fn bytes(&mut self, n: usize) -> Vec<u8> {
        (0..n).map(|_| self.u64() as u8).collect()
    }
    fn b256(&mut self) -> B256 {
        B256::from_slice(&self.bytes(32))
    }
    fn address(&mut self) -> Address {
        Address::from_slice(&self.bytes(20))
    }
    fn u256(&mut self) -> U256 {
        U256::from_be_slice(&self.bytes(32))
    }
    fn words(&mut self, max: u64) -> Vec<B256> {
        (0..self.below(max + 1)).map(|_| self.b256()).collect()
    }
    /// A commitment with every field drawn; `payment` below 2^128 when
    /// `bounded`, so a resolve's listed payments sum without overflow.
    fn commitment(&mut self, bounded: bool) -> Commitment {
        let payment = if bounded {
            (U256::from(self.u64()) << 64) | U256::from(self.u64())
        } else {
            self.u256()
        };
        Commitment {
            process_id: if self.below(4) == 0 {
                B256::ZERO
            } else {
                self.b256()
            },
            buyer: self.address(),
            seller: self.address(),
            token: self.address(),
            payment,
            running_total: self.u256(),
            checkout_hash: self.b256(),
            salt: self.u256(),
            commit_deadline: self.u256(),
        }
    }
    fn signature(&mut self) -> Signature {
        Signature {
            v: self.u64() as u8,
            r: self.b256(),
            s: self.b256(),
        }
    }
    fn listed(&mut self) -> Vec<Commitment> {
        (0..self.below(4)).map(|_| self.commitment(true)).collect()
    }
    fn witness(&mut self) -> AttestationWitness {
        AttestationWitness {
            clause_data_hash: self.b256(),
            inclusion_proof: self.words(3),
        }
    }
    fn role(&mut self) -> AttesterRole {
        if self.below(2) == 0 {
            AttesterRole::Seller
        } else {
            AttesterRole::Buyer
        }
    }
    /// One operation of any of the six kinds a batch carries: the three the
    /// stream writes in place (commit, signed resolve, wallet-code resolve),
    /// the wallet-code attestation it writes after them, and the two signed
    /// attestations it skips.
    fn op(&mut self) -> KernelOp {
        match self.below(6) {
            0 => KernelOp::Commit {
                commitment: self.commitment(false),
                buyer_sig: self.signature(),
                seller_sig: self.signature(),
            },
            1 => {
                let commitments = self.listed();
                KernelOp::Resolve {
                    process_id: self.b256(),
                    running_total: resolved_running_total(&commitments)
                        .expect("bounded payments sum"),
                    commitments,
                    buyer_sig: self.signature(),
                }
            }
            2 => {
                let commitments = self.listed();
                let len = [0, 1, 17, 65, 300][self.below(5) as usize];
                KernelOp::ResolveByWalletCode {
                    process_id: self.b256(),
                    running_total: resolved_running_total(&commitments)
                        .expect("bounded payments sum"),
                    commitments,
                    authorization: self.bytes(len).into(),
                }
            }
            3 => {
                let len = [0, 1, 65, 300][self.below(4) as usize];
                KernelOp::AttestByWalletCode {
                    role: self.role(),
                    target: self.commitment(false),
                    clause_id: self.b256(),
                    stage: self.u64() as u8,
                    content_ref: self.b256(),
                    authorization: self.bytes(len).into(),
                    proof: self.witness(),
                }
            }
            4 => KernelOp::AttestAsSeller {
                target: self.commitment(false),
                clause_id: self.b256(),
                stage: self.u64() as u8,
                content_ref: self.b256(),
                seller_sig: self.signature(),
                proof: self.witness(),
            },
            _ => KernelOp::AttestAsBuyer {
                target: self.commitment(false),
                clause_id: self.b256(),
                stage: self.u64() as u8,
                content_ref: self.b256(),
                buyer_sig: self.signature(),
                proof: self.witness(),
            },
        }
    }
    /// A usage claim of any of the three kinds, its inclusion proof (and an
    /// assembly claim's membership proof) of zero to four words.
    fn claim(&mut self) -> UsageClaim {
        let kind = match self.below(3) {
            0 => UsageClaimKind::Clause {
                clause_data_hash: self.b256(),
            },
            1 => UsageClaimKind::Process {
                agreement_hash: self.b256(),
                agreement_content_hash: self.b256(),
                membership_proof: self.words(4),
            },
            _ => UsageClaimKind::Agreement {
                process_design_hash: self.b256(),
            },
        };
        UsageClaim {
            order: self.commitment(false),
            clause_or_process: self.b256(),
            kind,
            inclusion_proof: self.words(4),
        }
    }
}

/// For 2,000 generated streams of up to eight operations of every kind and up
/// to five usage claims of every kind: decoding the encoded stream gives back
/// the commits and resolves (the signed attestations skipped), every
/// wallet-code attestation as its own entry and every claim, field for field;
/// re-encoding the three lists gives back the bytes; and the stream one byte
/// short or one byte long is refused. The run asserts it met every entry
/// kind, a kind-2 (agreement) claim and a claim with a non-empty inclusion
/// proof among them. The types carry no `PartialEq`, so "field for field" is
/// their `Debug` text, which prints every field.
#[test]
fn every_generated_stream_decodes_to_what_was_encoded() {
    let mut seen = [0u32; 10];
    for seed in 0..2_000u64 {
        let mut g = Gen(seed);
        let ops: Vec<KernelOp> = (0..g.below(9)).map(|_| g.op()).collect();
        let claims: Vec<UsageClaim> = (0..g.below(6)).map(|_| g.claim()).collect();
        let bytes = encode_operation_stream(&ops, &claims);

        let written: Vec<KernelOp> = ops
            .iter()
            .filter(|op| {
                matches!(
                    op,
                    KernelOp::Commit { .. }
                        | KernelOp::Resolve { .. }
                        | KernelOp::ResolveByWalletCode { .. }
                )
            })
            .cloned()
            .collect();
        let entries = wallet_code_attestations(&ops);
        let (ops2, entries2, claims2) = decode_operation_stream(&bytes)
            .unwrap_or_else(|e| panic!("seed {seed}: the stream does not decode: {e}"));
        assert_eq!(
            format!("{ops2:?}"),
            format!("{written:?}"),
            "seed {seed}: the commits and resolves"
        );
        assert_eq!(
            format!("{entries2:?}"),
            format!("{entries:?}"),
            "seed {seed}: the wallet-code attestations"
        );
        assert_eq!(
            format!("{claims2:?}"),
            format!("{claims:?}"),
            "seed {seed}: the usage claims"
        );
        assert_eq!(
            encode_stream_parts(&ops2, &entries2, &claims2),
            bytes,
            "seed {seed}: re-encoding is the identity"
        );
        if !bytes.is_empty() {
            assert!(
                decode_operation_stream(&bytes[..bytes.len() - 1]).is_err(),
                "seed {seed}: one byte short"
            );
        }
        let mut long = bytes.clone();
        long.push(g.u64() as u8);
        assert!(
            decode_operation_stream(&long).is_err(),
            "seed {seed}: one byte long"
        );

        for op in &written {
            seen[match op {
                KernelOp::Commit { .. } => 0,
                KernelOp::Resolve { .. } => 1,
                _ => 2,
            }] += 1;
        }
        for e in &entries {
            seen[if e.role == AttesterRole::Seller { 3 } else { 4 }] += 1;
        }
        for c in &claims {
            seen[match c.kind {
                UsageClaimKind::Clause { .. } => 5,
                UsageClaimKind::Process { .. } => 6,
                UsageClaimKind::Agreement { .. } => 7,
            }] += 1;
            if !c.inclusion_proof.is_empty() {
                seen[8] += 1;
            }
            if matches!(&c.kind, UsageClaimKind::Process { membership_proof, .. } if !membership_proof.is_empty())
            {
                seen[9] += 1;
            }
        }
    }
    let names = [
        "commit",
        "signed resolve",
        "wallet-code resolve",
        "seller's wallet-code attestation",
        "buyer's wallet-code attestation",
        "clause claim",
        "assembly claim",
        "agreement claim (kind 2)",
        "claim with an inclusion proof",
        "assembly claim with a membership proof",
    ];
    for (n, name) in seen.iter().zip(names) {
        assert!(
            *n > 50,
            "the generated streams met too few of: {name} ({n})"
        );
    }
}
