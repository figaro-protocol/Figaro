/// SP1 prover integration — executes the Figaro kernel program in the
/// zkVM and returns proof + public values.
use figaro_kernel::kernel::apply_batch_with_state;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::*;
use sp1_sdk::{self, Elf, ProveRequest, Prover, ProverClient, SP1Stdin};
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
    /// The provenance clause key the batch proved assembly claims
    /// against. Echoed from the input because it is calldata the
    /// verifier hash-checks, not something the guest returns.
    pub provenance_clause: alloy_primitives::B256,
}

/// Prove a batch.
///
/// The prover backend is selected by the `SP1_PROVER` environment variable:
/// unset or `mock` runs the mock prover (devnet — emits no proof, accepted by
/// the on-chain `MockSP1Verifier`); `cpu` / `cuda` run the real local SP1
/// prover (sp1-sdk's `network` backend — the Succinct Prover Network as a
/// liveness-only proof source — waits on this crate's alloy 1.x bump; the
/// proof would still verify against the program vkey, so no prover can forge
/// a settling proof). The proof FORM is `SP1_PROOF_MODE`:
/// `groth16` (default) or `plonk` — it must match the SP1 verifier gateway
/// `FigaroBatchVerifier` was deployed against (Succinct runs one gateway per
/// form; a proof of the other form is `RouteNotFound` on-chain).
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
        prove_wrapped(elf, stdin, &pv, proof_mode()?).await?
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
        provenance_clause: batch.provenance_clause,
    })
}

/// Whether to generate a real proof, per the `SP1_PROVER` env var. Unset or
/// `mock` → mock prover (devnet); any other value → a real, wrapped proof.
fn real_prover_selected() -> bool {
    match std::env::var("SP1_PROVER") {
        Ok(v) => !v.is_empty() && !v.eq_ignore_ascii_case("mock"),
        Err(_) => false,
    }
}

/// The on-chain proof form, per `SP1_PROOF_MODE`: `groth16` (default) or
/// `plonk`. Anything else is a configuration error, refused before proving.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProofMode {
    Groth16,
    Plonk,
}

pub fn proof_mode() -> Result<ProofMode, String> {
    match std::env::var("SP1_PROOF_MODE") {
        Err(_) => Ok(ProofMode::Groth16),
        Ok(v) if v.is_empty() || v.eq_ignore_ascii_case("groth16") => Ok(ProofMode::Groth16),
        Ok(v) if v.eq_ignore_ascii_case("plonk") => Ok(ProofMode::Plonk),
        Ok(v) => Err(format!("SP1_PROOF_MODE must be `groth16` or `plonk`, got `{v}`")),
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
    info!(
        cycles = report.total_instruction_count(),
        "SP1 execution complete"
    );
    let verified_pv: PublicValues = sp1_pv.read();
    check_state_roots(&verified_pv, pv)?;
    Ok(Vec::new())
}

/// Real prover (testnet / mainnet). Generates a WRAPPED proof — Groth16 or
/// PLONK per `mode`, the two forms an SP1 verifier gateway verifies on-chain —
/// with the prover backend named by `SP1_PROVER` (`cpu`, `cuda`).
async fn prove_wrapped(elf: Elf, stdin: SP1Stdin, pv: &PublicValues, mode: ProofMode) -> Result<Vec<u8>, String> {
    let client = ProverClient::from_env().await;
    let pk = client
        .setup(elf)
        .await
        .map_err(|e| format!("SP1 setup failed: {e}"))?;
    info!(?mode, "Generating wrapped proof (this can take minutes)");
    let request = client.prove(&pk, stdin);
    let mut proof = match mode {
        ProofMode::Groth16 => request.groth16().await.map_err(|e| format!("SP1 Groth16 proving failed: {e}"))?,
        ProofMode::Plonk => request.plonk().await.map_err(|e| format!("SP1 PLONK proving failed: {e}"))?,
    };
    let verified_pv: PublicValues = proof.public_values.read();
    check_state_roots(&verified_pv, pv)?;
    Ok(proof.bytes())
}

/// The SP1 proof and the local kernel execution must commit the same state
/// root transition; a mismatch means the guest program and the host kernel
/// have diverged.
fn check_state_roots(sp1: &PublicValues, local: &PublicValues) -> Result<(), String> {
    if sp1.prev_state_root != local.prev_state_root || sp1.new_state_root != local.new_state_root {
        return Err("SP1 and local execution produced different state roots".into());
    }
    Ok(())
}

/// ABI-encode PublicValues as 8 × 32-byte words for on-chain submission
/// (matches FigaroBatchVerifier._decodePV).
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
    data.extend_from_slice(pv.spec_bindings_hash.as_slice());
    data.extend_from_slice(pv.usage_accrual_hash.as_slice());
    data
}

#[cfg(test)]
mod proof_mode_tests {
    use super::{proof_mode, ProofMode};

    /// One test walks every case: the env var is process-global, so parallel
    /// tests over the same variable would race.
    #[test]
    fn proof_mode_reads_sp1_proof_mode() {
        std::env::remove_var("SP1_PROOF_MODE");
        assert_eq!(proof_mode(), Ok(ProofMode::Groth16));
        std::env::set_var("SP1_PROOF_MODE", "");
        assert_eq!(proof_mode(), Ok(ProofMode::Groth16));
        std::env::set_var("SP1_PROOF_MODE", "Groth16");
        assert_eq!(proof_mode(), Ok(ProofMode::Groth16));
        std::env::set_var("SP1_PROOF_MODE", "plonk");
        assert_eq!(proof_mode(), Ok(ProofMode::Plonk));
        std::env::set_var("SP1_PROOF_MODE", "stark");
        assert!(proof_mode().unwrap_err().contains("stark"));
        std::env::remove_var("SP1_PROOF_MODE");
    }
}
