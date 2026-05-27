//! Manual prove-test exerciser for the figaro-prover guest program.
//!
//! Runs the canonical end-to-end batch (constructed by `lib.rs`) through
//! SP1's mock client (Stage 1) and optionally a real local CPU proof
//! (Stage 2, gated by `SP1_REAL_PROOF=1`).
//!
//! Default flags:
//!   `SP1_MINIMAL_BATCH=1` — drop the Layer B content_proof from the seller
//!                          attestation. ~922K cycles vs ~1.03M with the
//!                          full content gate. Useful on memory-tight
//!                          machines; the kernel's content path is then
//!                          covered only by `cargo test -p figaro-prove-test`.
//!   `SP1_VKEY_ONLY=1`     — derive + print the program verification key
//!                          (for FigaroBatchVerifier / RpgfMinter deploy),
//!                          then stop. No real-proof step.
//!   `SP1_REAL_PROOF=1`    — after the mock stage, generate a real Core
//!                          proof on the local machine. Slow (~8 min on
//!                          a modern laptop); proves cryptographic
//!                          correctness of the mock-verified execution.

use figaro_kernel::types::PublicValues;
use figaro_prove_test::{build_canonical_batch_input, CHAIN_ID, CORE};
use sp1_sdk::{self, HashableKey, Prover, ProverClient, ProvingKey, SP1Stdin};

#[tokio::main]
async fn main() {
    let minimal_batch = std::env::var("SP1_MINIMAL_BATCH").is_ok();
    let input = build_canonical_batch_input(!minimal_batch);

    // Load the ELF.
    let elf = sp1_sdk::include_elf!("figaro-prover");

    // Stage 1 — Mock execution: cheap sanity check that the ELF runs
    // and the public values match the kernel's expected output.
    let mock_client = ProverClient::builder().mock().build().await;
    let mut stdin = SP1Stdin::new();
    stdin.write(&input);
    println!("── Stage 1/2 — Mock execution (no proof) ──");
    println!(
        "Batch mode: {}",
        if minimal_batch {
            "minimal — Layer B content gate OFF"
        } else {
            "full — Layer B content gate ON"
        },
    );
    let (mut public_values, report) =
        mock_client.execute(elf.clone(), stdin.clone()).await.unwrap();
    println!("Cycles: {}", report.total_instruction_count());

    let pv: PublicValues = public_values.read();
    println!("Previous state root: {:?}", pv.prev_state_root);
    println!("New state root:      {:?}", pv.new_state_root);
    println!("Chain ID:            {}", pv.chain_id);
    println!("Verifying contract:  {:?}", pv.verifying_contract);
    println!("Token ops hash:      {:?}", pv.token_ops_hash);
    println!("Attestation hash:    {:?}", pv.attestation_events_hash);
    println!("Schema hash:         {:?}", pv.schema_events_hash);
    println!("Operator hash:       {:?}", pv.operator_events_hash);

    assert_ne!(pv.prev_state_root, pv.new_state_root, "state should change");
    assert_eq!(pv.chain_id, CHAIN_ID);
    assert_eq!(pv.verifying_contract, CORE);

    // SP1_VKEY_ONLY — derive and print the program verification key
    // (SP1_PROGRAM_VKEY for the on-chain FigaroBatchVerifier / RpgfMinter
    // deploy), then stop. setup() is the cheap part of proving (~12s, no
    // OOM); this path never reaches the memory-heavy prove step.
    if std::env::var("SP1_VKEY_ONLY").is_ok() {
        println!("\n── Program verification key ──");
        let cpu_client = ProverClient::builder().cpu().build().await;
        let pk = cpu_client.setup(elf).await.expect("setup failed");
        println!("SP1_PROGRAM_VKEY={}", pk.verifying_key().bytes32());
        return;
    }

    // Stage 2 — Real CPU proof: generates an actual SP1 proof on the
    // local machine and verifies it against the verifying key.
    //
    // Gate with SP1_REAL_PROOF=1 because real proving is slow: the full
    // batch is ~1.03M cycles and a local Core proof takes ~8 minutes on a
    // modern laptop. Mock execution above already validates the program's
    // correctness; the real proof is a cryptographic attestation of that
    // execution.
    if std::env::var("SP1_REAL_PROOF").is_ok() {
        println!("\n── Stage 2/2 — Local CPU proof ──");
        let cpu_client = ProverClient::builder().cpu().build().await;
        println!("Building proving key (setup)...");
        let setup_start = std::time::Instant::now();
        let pk = cpu_client.setup(elf).await.expect("setup failed");
        println!("Setup complete in {:.1}s", setup_start.elapsed().as_secs_f64());

        println!("Generating Core proof (this can take minutes)...");
        let prove_start = std::time::Instant::now();
        let proof = cpu_client.prove(&pk, stdin).await.expect("prove failed");
        let prove_elapsed = prove_start.elapsed();
        println!("Proof generated in {:.1}s", prove_elapsed.as_secs_f64());

        // Re-read public values from the actual proof, not the mock run.
        let mut pv_bytes = proof.public_values.clone();
        let pv: PublicValues = pv_bytes.read();
        println!(
            "Proof public values — new_state_root: {:?}, attestation_hash: {:?}",
            pv.new_state_root, pv.attestation_events_hash,
        );

        println!("Verifying proof...");
        let verify_start = std::time::Instant::now();
        sp1_sdk::Prover::verify(&cpu_client, &proof, pk.verifying_key(), None)
            .expect("proof verification failed");
        println!("Verified in {:.1}s", verify_start.elapsed().as_secs_f64());

        let proof_bytes = bincode::serialize(&proof).expect("serialize proof");
        println!(
            "Proof size: {} bytes ({:.2} MB)",
            proof_bytes.len(),
            proof_bytes.len() as f64 / 1_048_576.0
        );

        println!("\n=== Real proof verified. ===");
    } else {
        println!("\n=== Execution verified. Program is correct. ===");
        println!(
            "To generate a real local proof: SP1_REAL_PROOF=1 cargo run -p figaro-prove-test --release"
        );
        println!("On a memory-constrained machine, add SP1_MINIMAL_BATCH=1 to drop the content gate.");
    }
}
