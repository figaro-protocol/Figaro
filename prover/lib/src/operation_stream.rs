//! The batch's operation stream: the canonical bytes of every operation that
//! moved the state, in the order the guest applied them, then every
//! attestation authorized by a party's wallet code and every usage claim the
//! batch applied. The guest commits `keccak256` of these bytes as a
//! public value (`PublicValues::operations_hash`); `FigaroBatchVerifier.settleBatch`
//! takes the bytes as calldata and refuses a batch whose bytes do not hash to
//! the committed word. So a batch cannot land without publishing, in its own
//! transaction, the signed operations behind its root. A stranger rebuilds
//! the state behind any root from the chain alone with this stream and what
//! the same transaction carries beside it: the period and the provenance
//! leaf of the `usage` argument (bound by public value 7), and the chain id,
//! the verifying contract and the clock of public values 2, 3 and 8.
//!
//! What the stream carries, and what it does not:
//! - every `Commit`, whole: the signed commitment and both signatures, as the
//!   direct path's `commit` carries them in calldata;
//! - every `Resolve`, whole: the process, the buyer's signature and the open
//!   commitments it names, as `FigaroCore.resolveProcess` carries them; the
//!   cumulative value the signature covers is the sum of those commitments'
//!   payments (a resolve lists every order of its process, and the guest
//!   applies one only while the process holds the value it signs), so the
//!   decoder derives it and the entry carries no word for it;
//! - every `ResolveByWalletCode`, whole: the process, the authorization bytes
//!   the buyer's wallet code validates and the commitments it names, the
//!   value derived as for `Resolve`. `FigaroBatchVerifier` reads the entry,
//!   derives the `ResolveProcess` digest under its own domain from the
//!   process and the listed payments, and calls the buyer's
//!   `isValidSignature` (ERC-1271) with the bytes; the buyer is the listed
//!   orders' (every order of a process carries its root buyer);
//! - every usage claim, whole: a claim moves no state, but the uses the
//!   verifier hands the counter are proved from the claims, so a replay of
//!   the stream re-derives the batch's usage hash (public value 7);
//! - every `AttestByWalletCode`, as its own entry after every commit and
//!   resolve: the role byte naming the party, the target commitment whole,
//!   the clause id, the stage, the content reference and the bytes the
//!   party's code validates. `FigaroBatchVerifier` derives the target's ids
//!   and the `AttestSeller` / `AttestBuyer` digest under its own domain from
//!   the commitment, takes the attester from the role, asks that account's
//!   `isValidSignature` (ERC-1271), and emits the coordinator's `Attestation`
//!   event only on the magic value; any other answer reverts the batch. No
//!   fingerprint of the witness enters the entry: the clause data hash, the
//!   inclusion proof and any plaintext stay with the relay and the prover;
//! - no signed attestation: an attestation moves no state (`apply_operations`
//!   writes nothing to the state for it), and a signed one's evidence is
//!   already bound by `attestation_events_hash` and re-emitted by the
//!   verifier. The rebuild reads the `0x05` entries and replays nothing for
//!   them.
//!
//! The format is fixed by the verification key like every other byte the
//! guest commits; a change here is a new key.
//!
//! ```text
//! stream   := entry*
//! entry    := 0x01 commitment sig sig            (Commit)
//!           | 0x02 processId(32) sig count(2) commitment*   (Resolve)
//!           | 0x03 commitment key(32) kind proof           (UsageClaim)
//!           | 0x04 processId(32) len(2) authorization count(2) commitment*
//!                                                   (ResolveByWalletCode)
//!           | 0x05 role(1) commitment clauseId(32) stage(1) contentRef(32)
//!                len(2) authorization              (AttestByWalletCode)
//! role     := 0x00 the target's seller | 0x01 the target's buyer
//! order    := the 0x01, 0x02 and 0x04 entries in the order applied, then
//!             every 0x05, then every 0x03
//! commitment := processId(32) buyer(20) seller(20) currency(20) payment(32)
//!               expectedCumulativeValue(32) checkoutHash(32) salt(32) deadline(32)
//! sig      := r(32) s(32) v(1)
//! kind     := 0x00 clauseDataHash(32)                        (USAGE_KIND_CLAUSE)
//!           | 0x01 agreementHash(32) slotContentHash(32) proof (USAGE_KIND_ASSEMBLY)
//!           | 0x02 assemblyHash(32)                          (USAGE_KIND_AGREEMENT)
//! The kind byte is `UsageClaimKind::code()`, the family code `UsageCounter`
//! keys accruals by, so one byte means one thing across the guest and the chain.
//! proof    := count(2) word(32)*
//! ```
//! Counts are big-endian `u16`; every length is prefixed, so the stream
//! cannot be re-split into another reading of the same bytes.

use alloy_primitives::{keccak256, Address, Bytes, B256, U256};

use crate::types::{
    AttesterRole, Commitment, KernelOp, Signature, UsageClaim, UsageClaimKind, USAGE_KIND_AGREEMENT,
    USAGE_KIND_ASSEMBLY, USAGE_KIND_CLAUSE,
};

const TAG_COMMIT: u8 = 0x01;
const TAG_RESOLVE: u8 = 0x02;
const TAG_USAGE_CLAIM: u8 = 0x03;
const TAG_RESOLVE_BY_WALLET_CODE: u8 = 0x04;
const TAG_ATTEST_BY_WALLET_CODE: u8 = 0x05;

/// One `0x05` entry: a wallet-code attestation as the stream publishes it,
/// without its witness.
#[derive(Clone, Debug)]
pub struct WalletCodeAttestation {
    pub role: AttesterRole,
    pub target: Commitment,
    pub clause_id: B256,
    pub stage: u8,
    pub content_ref: B256,
    pub authorization: Bytes,
}

/// The `0x05` entries `operations` publish: one per `AttestByWalletCode`, in
/// the order applied.
pub fn wallet_code_attestations(operations: &[KernelOp]) -> Vec<WalletCodeAttestation> {
    operations
        .iter()
        .filter_map(|op| match op {
            KernelOp::AttestByWalletCode { role, target, clause_id, stage, content_ref, authorization, .. } => {
                Some(WalletCodeAttestation {
                    role: *role,
                    target: target.clone(),
                    clause_id: *clause_id,
                    stage: *stage,
                    content_ref: *content_ref,
                    authorization: authorization.clone(),
                })
            }
            _ => None,
        })
        .collect()
}

/// The packed width of one commitment.
pub const COMMITMENT_BYTES: usize = 32 + 20 + 20 + 20 + 32 + 32 + 32 + 32 + 32;
/// The packed width of one signature.
pub const SIGNATURE_BYTES: usize = 65;

/// Encode the stream of `operations` (signed attestations skipped, each
/// wallet-code attestation an entry after the commits and resolves) followed
/// by `claims`, in their given order.
pub fn encode_operation_stream(operations: &[KernelOp], claims: &[UsageClaim]) -> Vec<u8> {
    encode_stream_parts(operations, &wallet_code_attestations(operations), claims)
}

/// Encode a stream from its three lists, as `decode_operation_stream`
/// returns them: the commits and resolves of `operations` (any attestation
/// in it skipped), then `attestations` as `0x05` entries, then `claims`.
pub fn encode_stream_parts(
    operations: &[KernelOp],
    attestations: &[WalletCodeAttestation],
    claims: &[UsageClaim],
) -> Vec<u8> {
    let mut out = Vec::new();
    for op in operations {
        match op {
            KernelOp::Commit {
                commitment,
                buyer_sig,
                seller_sig,
            } => {
                out.push(TAG_COMMIT);
                put_commitment(&mut out, commitment);
                put_signature(&mut out, buyer_sig);
                put_signature(&mut out, seller_sig);
            }
            KernelOp::Resolve {
                process_id,
                commitments,
                buyer_sig,
                ..
            } => {
                out.push(TAG_RESOLVE);
                out.extend_from_slice(process_id.as_slice());
                put_signature(&mut out, buyer_sig);
                put_count(&mut out, commitments.len());
                for c in commitments {
                    put_commitment(&mut out, c);
                }
            }
            KernelOp::ResolveByWalletCode {
                process_id,
                commitments,
                authorization,
                ..
            } => {
                out.push(TAG_RESOLVE_BY_WALLET_CODE);
                out.extend_from_slice(process_id.as_slice());
                put_count(&mut out, authorization.len());
                out.extend_from_slice(authorization);
                put_count(&mut out, commitments.len());
                for c in commitments {
                    put_commitment(&mut out, c);
                }
            }
            KernelOp::AttestAsSeller { .. } | KernelOp::AttestAsBuyer { .. } | KernelOp::AttestByWalletCode { .. } => {}
        }
    }
    for a in attestations {
        out.push(TAG_ATTEST_BY_WALLET_CODE);
        out.push(a.role.code());
        put_commitment(&mut out, &a.target);
        out.extend_from_slice(a.clause_id.as_slice());
        out.push(a.stage);
        out.extend_from_slice(a.content_ref.as_slice());
        put_count(&mut out, a.authorization.len());
        out.extend_from_slice(&a.authorization);
    }
    for claim in claims {
        out.push(TAG_USAGE_CLAIM);
        put_commitment(&mut out, &claim.order);
        out.extend_from_slice(claim.clause_or_assembly.as_slice());
        out.push(claim.kind.code());
        match &claim.kind {
            UsageClaimKind::Clause { clause_data_hash } => {
                out.extend_from_slice(clause_data_hash.as_slice());
            }
            UsageClaimKind::Agreement { assembly_hash } => {
                out.extend_from_slice(assembly_hash.as_slice());
            }
            UsageClaimKind::Assembly {
                agreement_hash,
                slot_content_hash,
                membership_proof,
            } => {
                out.extend_from_slice(agreement_hash.as_slice());
                out.extend_from_slice(slot_content_hash.as_slice());
                put_words(&mut out, membership_proof);
            }
        }
        put_words(&mut out, &claim.inclusion_proof);
    }
    out
}

/// The public value: `keccak256` of the stream.
pub fn compute_operations_hash(stream: &[u8]) -> B256 {
    keccak256(stream)
}

/// What a stream decodes to: the commits and resolves, the wallet-code
/// attestations' entries, and the usage claims.
pub type DecodedStream = (Vec<KernelOp>, Vec<WalletCodeAttestation>, Vec<UsageClaim>);

/// Decode a stream back into its three lists; `encode_stream_parts` of them
/// gives back the same bytes. Strict: an unknown tag or role, a short read,
/// a trailing byte, or an entry out of its place (a commit or resolve after
/// a `0x05` or a `0x03`, a `0x05` after a `0x03`) is an error.
pub fn decode_operation_stream(stream: &[u8]) -> Result<DecodedStream, String> {
    let mut r = Reader { data: stream, pos: 0 };
    let mut operations = Vec::new();
    let mut attestations: Vec<WalletCodeAttestation> = Vec::new();
    let mut claims = Vec::new();
    while !r.done() {
        match r.u8()? {
            TAG_COMMIT => {
                if !claims.is_empty() || !attestations.is_empty() {
                    return Err("a commit after a usage claim or a wallet-code attestation".into());
                }
                operations.push(KernelOp::Commit {
                    commitment: r.commitment()?,
                    buyer_sig: r.signature()?,
                    seller_sig: r.signature()?,
                });
            }
            TAG_RESOLVE => {
                if !claims.is_empty() || !attestations.is_empty() {
                    return Err("a resolve after a usage claim or a wallet-code attestation".into());
                }
                let process_id = r.b256()?;
                let buyer_sig = r.signature()?;
                let count = r.count()?;
                let mut commitments = Vec::with_capacity(count);
                for _ in 0..count {
                    commitments.push(r.commitment()?);
                }
                let cumulative_value = resolved_cumulative_value(&commitments)
                    .ok_or_else(|| "a resolve whose payments overflow".to_string())?;
                operations.push(KernelOp::Resolve {
                    process_id,
                    cumulative_value,
                    commitments,
                    buyer_sig,
                });
            }
            TAG_RESOLVE_BY_WALLET_CODE => {
                if !claims.is_empty() || !attestations.is_empty() {
                    return Err("a resolve after a usage claim or a wallet-code attestation".into());
                }
                let process_id = r.b256()?;
                let len = r.count()?;
                let authorization = Bytes::copy_from_slice(r.take(len)?);
                let count = r.count()?;
                let mut commitments = Vec::with_capacity(count);
                for _ in 0..count {
                    commitments.push(r.commitment()?);
                }
                let cumulative_value = resolved_cumulative_value(&commitments)
                    .ok_or_else(|| "a resolve whose payments overflow".to_string())?;
                operations.push(KernelOp::ResolveByWalletCode {
                    process_id,
                    cumulative_value,
                    commitments,
                    authorization,
                });
            }
            TAG_ATTEST_BY_WALLET_CODE => {
                if !claims.is_empty() {
                    return Err("a wallet-code attestation after a usage claim".into());
                }
                let role_byte = r.u8()?;
                let role = AttesterRole::from_code(role_byte)
                    .ok_or_else(|| format!("unknown attester role 0x{role_byte:02x}"))?;
                let target = r.commitment()?;
                let clause_id = r.b256()?;
                let stage = r.u8()?;
                let content_ref = r.b256()?;
                let len = r.count()?;
                let authorization = Bytes::copy_from_slice(r.take(len)?);
                attestations.push(WalletCodeAttestation { role, target, clause_id, stage, content_ref, authorization });
            }
            TAG_USAGE_CLAIM => {
                let order = r.commitment()?;
                let clause_or_assembly = r.b256()?;
                let kind = match r.u8()? {
                    USAGE_KIND_CLAUSE => UsageClaimKind::Clause {
                        clause_data_hash: r.b256()?,
                    },
                    USAGE_KIND_AGREEMENT => UsageClaimKind::Agreement {
                        assembly_hash: r.b256()?,
                    },
                    USAGE_KIND_ASSEMBLY => UsageClaimKind::Assembly {
                        agreement_hash: r.b256()?,
                        slot_content_hash: r.b256()?,
                        membership_proof: r.words()?,
                    },
                    k => return Err(format!("unknown usage claim kind 0x{k:02x}")),
                };
                let inclusion_proof = r.words()?;
                claims.push(UsageClaim {
                    order,
                    clause_or_assembly,
                    kind,
                    inclusion_proof,
                });
            }
            t => return Err(format!("unknown stream tag 0x{t:02x} at byte {}", r.pos - 1)),
        }
    }
    Ok((operations, attestations, claims))
}

/// The cumulative value a resolve listing `commitments` signs when it
/// applies: the sum of their payments, which is the process's accumulator
/// once every order of the process is listed. `None` on overflow.
pub fn resolved_cumulative_value(commitments: &[Commitment]) -> Option<U256> {
    commitments
        .iter()
        .try_fold(U256::ZERO, |sum, c| sum.checked_add(c.payment))
}

fn put_commitment(out: &mut Vec<u8>, c: &Commitment) {
    out.extend_from_slice(c.process_id.as_slice());
    out.extend_from_slice(c.buyer.as_slice());
    out.extend_from_slice(c.seller.as_slice());
    out.extend_from_slice(c.currency.as_slice());
    out.extend_from_slice(&c.payment.to_be_bytes::<32>());
    out.extend_from_slice(&c.expected_cumulative_value.to_be_bytes::<32>());
    out.extend_from_slice(c.checkout_hash.as_slice());
    out.extend_from_slice(&c.salt.to_be_bytes::<32>());
    out.extend_from_slice(&c.deadline.to_be_bytes::<32>());
}

fn put_signature(out: &mut Vec<u8>, s: &Signature) {
    out.extend_from_slice(s.r.as_slice());
    out.extend_from_slice(s.s.as_slice());
    out.push(s.v);
}

fn put_count(out: &mut Vec<u8>, n: usize) {
    let n = u16::try_from(n).expect("a stream count fits u16: a batch never carries 65,536 of one thing");
    out.extend_from_slice(&n.to_be_bytes());
}

fn put_words(out: &mut Vec<u8>, words: &[B256]) {
    put_count(out, words.len());
    for w in words {
        out.extend_from_slice(w.as_slice());
    }
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn done(&self) -> bool {
        self.pos >= self.data.len()
    }
    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        if self.pos + n > self.data.len() {
            return Err(format!(
                "stream ends at byte {} while {n} more were needed at byte {}",
                self.data.len(),
                self.pos
            ));
        }
        let s = &self.data[self.pos..self.pos + n];
        self.pos += n;
        Ok(s)
    }
    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }
    fn count(&mut self) -> Result<usize, String> {
        let b = self.take(2)?;
        Ok(u16::from_be_bytes([b[0], b[1]]) as usize)
    }
    fn b256(&mut self) -> Result<B256, String> {
        Ok(B256::from_slice(self.take(32)?))
    }
    fn address(&mut self) -> Result<Address, String> {
        Ok(Address::from_slice(self.take(20)?))
    }
    fn u256(&mut self) -> Result<U256, String> {
        Ok(U256::from_be_slice(self.take(32)?))
    }
    fn signature(&mut self) -> Result<Signature, String> {
        let r = self.b256()?;
        let s = self.b256()?;
        let v = self.u8()?;
        Ok(Signature { v, r, s })
    }
    fn commitment(&mut self) -> Result<Commitment, String> {
        Ok(Commitment {
            process_id: self.b256()?,
            buyer: self.address()?,
            seller: self.address()?,
            currency: self.address()?,
            payment: self.u256()?,
            expected_cumulative_value: self.u256()?,
            checkout_hash: self.b256()?,
            salt: self.u256()?,
            deadline: self.u256()?,
        })
    }
    fn words(&mut self) -> Result<Vec<B256>, String> {
        let n = self.count()?;
        let mut v = Vec::with_capacity(n);
        for _ in 0..n {
            v.push(self.b256()?);
        }
        Ok(v)
    }
}
