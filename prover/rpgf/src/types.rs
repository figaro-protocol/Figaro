use alloy_primitives::{Address, B256, U256};
use serde::{Deserialize, Serialize};

/// Cumulative state of attestations under a single clauseId at a tranche
/// timestamp. The aggregator receives one of these per clause in the
/// population for a given tranche. Values are pre-aggregated by an
/// off-chain sequencer / indexer; the SP1 proof attests to the V5-formula
/// computation over these inputs, not to the inputs themselves.
///
/// Mirrors the TypeScript `ClauseSnapshot` in
/// `sdk/scripts/rpgf-simulator/types.ts`. Value-related fields are
/// deliberately omitted — the coordination protocol is value-agnostic.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClauseSnapshot {
    pub clause_id: B256,
    /// First-write-wins binder from ClauseRegistry — receives the FIG.
    pub clause_author: Address,
    /// Family tag from ClauseRegistry — the unit the Tier-1 boost reads.
    /// `B256::ZERO` signals the registration event was missing from the
    /// upstream decoder stream (same documented-incomplete signal as
    /// `clause_author == Address::ZERO`).
    pub family: B256,

    pub resolved_attestation_count: u64,
    pub distinct_processes: u64,
    pub distinct_attestation_stages: u8,

    pub distinct_buyers: u64,
    pub distinct_sellers: u64,
    pub distinct_buyer_seller_pairs: u64,

    pub total_chain_position_weight: u64,
    /// Fixed-point: actual mean × 1_000_000. e.g. chain pos 3.0 = 3_000_000.
    pub mean_chain_position_x1e6: u64,
}

/// Input to the aggregator: a per-tranche batch of clause snapshots
/// plus the deploy-frozen formula parameters.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TrancheInput {
    pub tranche_index: u8,
    pub tranche_budget_wei: U256,
    /// α as a fraction. Default V5: 33 / 100.
    pub alpha_numerator: u32,
    pub alpha_denominator: u32,
    /// Per-author cap as a fraction. Default V5: 15 / 100.
    pub cap_numerator: u32,
    pub cap_denominator: u32,
    pub snapshots: Vec<ClauseSnapshot>,
}

/// Public values committed by the SP1 program. The new minter contract
/// reads these on-chain to verify (tranche_index, merkle_root,
/// total_allocated_wei) against the proof.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrancheOutput {
    pub tranche_index: u8,
    pub merkle_root: B256,
    pub total_allocated_wei: U256,
    pub clause_count: u32,
}

impl TrancheOutput {
    /// Encode as Solidity ABI `abi.encode(uint8, bytes32, uint256, uint32)` —
    /// 4 × 32-byte words, total 128 bytes. The SP1 program commits these
    /// bytes via `sp1_zkvm::io::commit_slice`, which is what
    /// `RpgfMinter.submitRoot` expects in its `publicValues` argument
    /// before its `abi.decode((uint8, bytes32, uint256, uint32))`.
    ///
    /// Word layout:
    ///   [0..32]   — uint8  tranche_index    (zero-padded, value at byte 31)
    ///   [32..64]  — bytes32 merkle_root     (32 raw bytes)
    ///   [64..96]  — uint256 total_allocated (32 big-endian bytes)
    ///   [96..128] — uint32 clause_count     (zero-padded, value at bytes 124..128)
    pub fn abi_encode_public_values(&self) -> Vec<u8> {
        let mut out = vec![0u8; 128];
        out[31] = self.tranche_index;
        out[32..64].copy_from_slice(self.merkle_root.as_slice());
        out[64..96].copy_from_slice(&self.total_allocated_wei.to_be_bytes::<32>());
        out[124..128].copy_from_slice(&self.clause_count.to_be_bytes());
        out
    }
}
