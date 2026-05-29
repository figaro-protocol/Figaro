/// SP1 prover integration — executes the Figaro kernel program in the
/// zkVM and returns proof + public values.
use figaro_kernel::kernel::apply_batch_with_state;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::*;
use sp1_sdk::{self, Elf, Prover, ProveRequest, ProverClient, SP1Stdin};
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

/// Prove a batch.
///
/// The prover backend is selected by the `SP1_PROVER` environment variable:
/// unset or `mock` runs the mock prover (devnet — emits no proof, accepted by
/// the on-chain `MockSP1Verifier`); any other value (`cpu`, `cuda`) runs the
/// real local SP1 prover and emits a Groth16 proof for on-chain verification
/// by `FigaroBatchVerifier`. The protocol depends on no external proving
/// service — a sequencer self-proves with the open-source SP1 prover.
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

    let elf = sp1_sdk::include_elf!("figaro-prover");
    let mut stdin = SP1Stdin::new();
    stdin.write(batch);

    let proof_bytes = if real_prover_selected() {
        prove_groth16(elf, stdin, &pv).await?
    } else {
        prove_mock(elf, stdin, &pv).await?
    };

    let public_values_bytes = encode_public_values(&pv);

    Ok(ProveResult {
        public_values: pv,
        positions,
        events,
        proof_bytes,
        public_values_bytes,
        post_state,
    })
}

/// Whether to generate a real proof, per the `SP1_PROVER` env var. Unset or
/// `mock` → mock prover (devnet); any other value → real Groth16 prover.
fn real_prover_selected() -> bool {
    match std::env::var("SP1_PROVER") {
        Ok(v) => !v.is_empty() && !v.eq_ignore_ascii_case("mock"),
        Err(_) => false,
    }
}

/// Mock prover (devnet). Executes the guest program to validate it and to
/// cross-check state roots, but emits no proof — the on-chain
/// `MockSP1Verifier` accepts the resulting empty proof.
async fn prove_mock(elf: Elf, stdin: SP1Stdin, pv: &PublicValues) -> Result<Vec<u8>, String> {
    let client = ProverClient::builder().mock().build().await;
    let (mut sp1_pv, report) = client
        .execute(elf, stdin)
        .await
        .map_err(|e| format!("SP1 execution failed: {e}"))?;
    info!(cycles = report.total_instruction_count(), "SP1 execution complete");
    let verified_pv: PublicValues = sp1_pv.read();
    check_state_roots(&verified_pv, pv)?;
    Ok(Vec::new())
}

/// Real prover (testnet / mainnet). Generates a Groth16 proof — the only
/// proof form `FigaroBatchVerifier` can verify on-chain — using the local SP1
/// prover backend named by `SP1_PROVER` (`cpu`, `cuda`). No external service.
async fn prove_groth16(elf: Elf, stdin: SP1Stdin, pv: &PublicValues) -> Result<Vec<u8>, String> {
    let client = ProverClient::from_env().await;
    let pk = client
        .setup(elf)
        .await
        .map_err(|e| format!("SP1 setup failed: {e}"))?;
    info!("Generating Groth16 proof (this can take minutes)");
    let mut proof = client
        .prove(&pk, stdin)
        .groth16()
        .await
        .map_err(|e| format!("SP1 Groth16 proving failed: {e}"))?;
    let verified_pv: PublicValues = proof.public_values.read();
    check_state_roots(&verified_pv, pv)?;
    Ok(proof.bytes())
}

/// The SP1 proof and the local kernel execution must commit the same state
/// root transition; a mismatch means the guest program and the host kernel
/// have diverged.
fn check_state_roots(sp1: &PublicValues, local: &PublicValues) -> Result<(), String> {
    if sp1.prev_state_root != local.prev_state_root
        || sp1.new_state_root != local.new_state_root
    {
        return Err("SP1 and local execution produced different state roots".into());
    }
    Ok(())
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
    data.extend_from_slice(pv.clause_events_hash.as_slice());
    data.extend_from_slice(pv.seller_events_hash.as_slice());
    data
}
