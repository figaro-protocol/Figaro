/// SP1 prover integration — executes the Figaro kernel program in the
/// zkVM and returns proof + public values.
use figaro_kernel::kernel::apply_batch_with_state;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::*;
use sp1_sdk::{self, Prover, ProverClient, SP1Stdin};
use tracing::info;

/// Result of proving a batch.
pub struct ProveResult {
    /// The public values committed by the proof.
    pub public_values: PublicValues,
    /// Net token positions for on-chain reconciliation.
    pub positions: Vec<NetPosition>,
    /// Side-effect events for on-chain re-emission.
    pub events: BatchEvents,
    /// Raw proof bytes (empty for mock prover).
    pub proof_bytes: Vec<u8>,
    /// Raw public values bytes (ABI-encoded for on-chain submission).
    pub public_values_bytes: Vec<u8>,
    /// Post-batch kernel state for advancing the state mirror.
    pub post_state: KernelState,
}

/// Prove a batch using the SP1 mock prover (devnet).
///
/// In production, this would use `ProverClient::builder().network()` for
/// real STARK/SNARK proof generation via the SP1 network.
pub async fn prove_batch(batch: &BatchInput) -> Result<ProveResult, String> {
    // First: execute the kernel locally to get positions and events.
    // The SP1 guest program only commits PublicValues; positions and events
    // are side-effects computed locally and hash-verified on-chain.
    let (pv, positions, events, post_state) =
        apply_batch_with_state(batch).map_err(|e| format!("kernel execution failed: {e}"))?;

    info!(
        prev_root = ?pv.prev_state_root,
        new_root = ?pv.new_state_root,
        ops = batch.operations.len(),
        positions = positions.len(),
        "Kernel execution succeeded"
    );

    // Run SP1 mock prover to validate the guest program.
    let elf = sp1_sdk::include_elf!("figaro-prover");
    let client = ProverClient::builder().mock().build().await;

    let mut stdin = SP1Stdin::new();
    stdin.write(batch);

    let (mut sp1_pv, report) = client
        .execute(elf, stdin)
        .await
        .map_err(|e| format!("SP1 execution failed: {e}"))?;

    info!(cycles = report.total_instruction_count(), "SP1 execution complete");

    let verified_pv: PublicValues = sp1_pv.read();

    // Sanity: local execution and SP1 execution must agree.
    if verified_pv.prev_state_root != pv.prev_state_root
        || verified_pv.new_state_root != pv.new_state_root
    {
        return Err("SP1 and local execution produced different state roots".into());
    }

    // For mock prover, proof bytes are empty. The on-chain MockSP1Verifier
    // accepts any proof.
    let public_values_bytes = encode_public_values(&pv);

    Ok(ProveResult {
        public_values: pv,
        positions,
        events,
        proof_bytes: vec![],
        public_values_bytes,
        post_state,
    })
}

/// ABI-encode PublicValues as 8 × 32-byte words for on-chain submission.
fn encode_public_values(pv: &PublicValues) -> Vec<u8> {
    use alloy_primitives::U256;

    let mut data = Vec::with_capacity(256);
    data.extend_from_slice(pv.prev_state_root.as_slice());
    data.extend_from_slice(pv.new_state_root.as_slice());
    data.extend_from_slice(&U256::from(pv.chain_id).to_be_bytes::<32>());
    // Address left-padded to 32 bytes
    let mut addr_word = [0u8; 32];
    addr_word[12..].copy_from_slice(pv.verifying_contract.as_slice());
    data.extend_from_slice(&addr_word);
    data.extend_from_slice(pv.token_ops_hash.as_slice());
    data.extend_from_slice(pv.attestation_events_hash.as_slice());
    data.extend_from_slice(pv.schema_events_hash.as_slice());
    data.extend_from_slice(pv.operator_events_hash.as_slice());
    data
}
