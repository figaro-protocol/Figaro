use alloy_primitives::{Address, B256, U256, keccak256};

use crate::types::{Commitment, KernelError, Signature};

// ── ABI helpers ───────────────────────────────────────────────────

/// Left-pad a 20-byte address to a 32-byte ABI word.
fn abi_encode_address(addr: &Address) -> [u8; 32] {
    let mut word = [0u8; 32];
    word[12..].copy_from_slice(addr.as_slice());
    word
}

// ── EIP-712 domain ────────────────────────────────────────────────

/// Compute the EIP-712 domain separator matching
/// `FigaroCore`'s constructor: `EIP712("FigaroCore", "3")`.
pub fn domain_separator(chain_id: u64, verifying_contract: Address) -> B256 {
    let type_hash = keccak256(
        b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
    );
    let name_hash = keccak256(b"FigaroCore");
    let version_hash = keccak256(b"3");

    let mut data = Vec::with_capacity(160);
    data.extend_from_slice(type_hash.as_slice());
    data.extend_from_slice(name_hash.as_slice());
    data.extend_from_slice(version_hash.as_slice());
    data.extend_from_slice(&U256::from(chain_id).to_be_bytes::<32>());
    data.extend_from_slice(&abi_encode_address(&verifying_contract));
    keccak256(&data)
}

// ── Commitment struct hash ────────────────────────────────────────

/// COMMITMENT_TYPEHASH matching `CommitmentTypes.sol`.
fn commitment_typehash() -> B256 {
    keccak256(
        b"Commitment(bytes32 processId,address buyer,address seller,address currency,uint256 payment,uint256 expectedCumulativeValue,bytes32 agreementHash,uint256 salt,uint256 deadline)",
    )
}

/// Compute the EIP-712 struct hash for a `Commitment`.
/// Result matches `CommitmentTypes.hashStruct()` in Solidity.
pub fn commitment_struct_hash(c: &Commitment) -> B256 {
    let mut data = Vec::with_capacity(320);
    data.extend_from_slice(commitment_typehash().as_slice());
    data.extend_from_slice(c.process_id.as_slice());
    data.extend_from_slice(&abi_encode_address(&c.buyer));
    data.extend_from_slice(&abi_encode_address(&c.seller));
    data.extend_from_slice(&abi_encode_address(&c.currency));
    data.extend_from_slice(&c.payment.to_be_bytes::<32>());
    data.extend_from_slice(&c.expected_cumulative_value.to_be_bytes::<32>());
    data.extend_from_slice(c.agreement_hash.as_slice());
    data.extend_from_slice(&c.salt.to_be_bytes::<32>());
    data.extend_from_slice(&c.deadline.to_be_bytes::<32>());
    keccak256(&data)
}

// ── Resolve authorization ─────────────────────────────────────────
//
// Not in the Solidity kernel. This is the batched equivalent of
// msg.sender == rootBuyer. The buyer signs an EIP-712 typed message
// authorizing process resolution. Natural replay protection: once
// resolveProcess sets activeOrderCount = 0, the process cannot be
// resolved again, and the processId can never be reused.

/// Compute the struct hash for a `ResolveProcess` authorization.
pub fn resolve_struct_hash(process_id: &B256) -> B256 {
    let type_hash = keccak256(b"ResolveProcess(bytes32 processId)");
    let mut data = Vec::with_capacity(64);
    data.extend_from_slice(type_hash.as_slice());
    data.extend_from_slice(process_id.as_slice());
    keccak256(&data)
}

// ── Attestation authorization ─────────────────────────────────────
//
// Batched equivalent of msg.sender checks in AttestationCoordinator.
// The attester signs an EIP-712 typed message proving their identity.
// Replay protection: attestations are idempotent events, not state
// transitions, so replaying is harmless (same event re-emitted).

/// Struct hash for seller attestation authorization.
/// `AttestSeller(bytes32 orderHash,bytes32 clauseId,uint8 stage,bytes32 contentRef)`
pub fn attest_seller_struct_hash(
    order_hash: &B256,
    clause_id: &B256,
    stage: u8,
    content_ref: &B256,
) -> B256 {
    let type_hash = keccak256(
        b"AttestSeller(bytes32 orderHash,bytes32 clauseId,uint8 stage,bytes32 contentRef)",
    );
    let mut data = Vec::with_capacity(160);
    data.extend_from_slice(type_hash.as_slice());
    data.extend_from_slice(order_hash.as_slice());
    data.extend_from_slice(clause_id.as_slice());
    // uint8 is ABI-encoded as uint256 in EIP-712 struct hashing
    data.extend_from_slice(&alloy_primitives::U256::from(stage).to_be_bytes::<32>());
    data.extend_from_slice(content_ref.as_slice());
    keccak256(&data)
}

/// Struct hash for buyer attestation authorization.
/// `AttestBuyer(bytes32 processId,bytes32 orderHash,bytes32 clauseId,uint8 stage,bytes32 contentRef)`
pub fn attest_buyer_struct_hash(
    process_id: &B256,
    order_hash: &B256,
    clause_id: &B256,
    stage: u8,
    content_ref: &B256,
) -> B256 {
    let type_hash = keccak256(
        b"AttestBuyer(bytes32 processId,bytes32 orderHash,bytes32 clauseId,uint8 stage,bytes32 contentRef)",
    );
    let mut data = Vec::with_capacity(192);
    data.extend_from_slice(type_hash.as_slice());
    data.extend_from_slice(process_id.as_slice());
    data.extend_from_slice(order_hash.as_slice());
    data.extend_from_slice(clause_id.as_slice());
    data.extend_from_slice(&alloy_primitives::U256::from(stage).to_be_bytes::<32>());
    data.extend_from_slice(content_ref.as_slice());
    keccak256(&data)
}

// Registry mutations (RegisterClause / SetMechanismClause / RegisterSeller /
// UpdateProfile) are once-per-clause-or-assembly ETH-staked intents that stay
// on the direct path — the batch covers the kernel + attestation surface
// only, so this module defines no EIP-712 types for them.

// ── Typed data hash ───────────────────────────────────────────────

/// `keccak256("\x19\x01" || domainSeparator || structHash)`
pub fn typed_data_hash(domain_sep: &B256, struct_hash: &B256) -> B256 {
    let mut data = Vec::with_capacity(66);
    data.extend_from_slice(&[0x19, 0x01]);
    data.extend_from_slice(domain_sep.as_slice());
    data.extend_from_slice(struct_hash.as_slice());
    keccak256(&data)
}

// ── Order hash ────────────────────────────────────────────────────

/// `keccak256(abi.encodePacked(processId, structHash))`
/// Both are bytes32, so packed encoding is direct concatenation.
pub fn compute_order_hash(process_id: &B256, struct_hash: &B256) -> B256 {
    let mut data = [0u8; 64];
    data[..32].copy_from_slice(process_id.as_slice());
    data[32..].copy_from_slice(struct_hash.as_slice());
    keccak256(data)
}

// ── ECDSA recovery ────────────────────────────────────────────────

/// Recover the signer address from an EIP-712 digest and ECDSA signature.
/// Matches Solidity's `ECDSA.recover(digest, signature)`.
pub fn recover_signer(digest: &B256, sig: &Signature) -> Result<Address, KernelError> {
    use k256::ecdsa::{RecoveryId, Signature as EcdsaSignature, VerifyingKey};

    // Normalize v: Ethereum uses 27/28, recovery ID uses 0/1.
    let v = if sig.v >= 27 { sig.v - 27 } else { sig.v };
    let recovery_id =
        RecoveryId::try_from(v).map_err(|_| KernelError::InvalidSignature)?;

    let mut sig_bytes = [0u8; 64];
    sig_bytes[..32].copy_from_slice(sig.r.as_slice());
    sig_bytes[32..].copy_from_slice(sig.s.as_slice());

    let signature =
        EcdsaSignature::from_slice(&sig_bytes).map_err(|_| KernelError::InvalidSignature)?;

    let verifying_key = VerifyingKey::recover_from_prehash(
        digest.as_slice(),
        &signature,
        recovery_id,
    )
    .map_err(|_| KernelError::InvalidSignature)?;

    // Uncompressed public key: 0x04 || x[32] || y[32].
    // Ethereum address = keccak256(x || y)[12..].
    let pubkey = verifying_key.to_encoded_point(false);
    let pubkey_hash = keccak256(&pubkey.as_bytes()[1..]);
    Ok(Address::from_slice(&pubkey_hash[12..]))
}
