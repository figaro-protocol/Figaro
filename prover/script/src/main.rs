use alloy_primitives::{address, Address, B256, U256, keccak256};
use k256::ecdsa::SigningKey;
use sp1_sdk::{self, HashableKey, Prover, ProverClient, ProvingKey, SP1Stdin};

use figaro_kernel::eip712::*;
use figaro_kernel::types::*;

// ── Same test keys as parity tests ────────────────────────────────

const BUYER_KEY: u64 = 0xB0B;
const SELLER1_KEY: u64 = 0x5E11;

const BUYER: Address = address!("0376AAc07Ad725E01357B1725B5ceC61aE10473c");
const SELLER1: Address = address!("Ad29D7a8aD3639F97798c768202F27C1dE81DC55");
const TOKEN: Address = address!("5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f");
const CORE: Address = address!("2e234DAe75C793f67A35089C9d99245E1C58470b");
const CHAIN_ID: u64 = 31337;

fn make_signing_key(secret: u64) -> SigningKey {
    let mut bytes = [0u8; 32];
    bytes[24..].copy_from_slice(&secret.to_be_bytes());
    SigningKey::from_bytes((&bytes).into()).unwrap()
}

fn sign_digest(key: &SigningKey, digest: &B256) -> Signature {
    use k256::ecdsa::{signature::hazmat::PrehashSigner, RecoveryId};
    let (sig, recid): (k256::ecdsa::Signature, RecoveryId) =
        key.sign_prehash(digest.as_slice()).unwrap();
    let sig_bytes = sig.to_bytes();
    Signature {
        v: recid.to_byte() + 27,
        r: B256::from_slice(&sig_bytes[..32]),
        s: B256::from_slice(&sig_bytes[32..]),
    }
}

fn sign_commitment(c: &Commitment, domain: &B256, key: &SigningKey) -> Signature {
    let struct_hash = commitment_struct_hash(c);
    let digest = typed_data_hash(domain, &struct_hash);
    sign_digest(key, &digest)
}

#[tokio::main]
async fn main() {
    // Build a comprehensive batch: commit + schema + operator + attest + resolve.
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    // SP1_MINIMAL_BATCH=1 drops the Layer B content_proof from the seller
    // attestation below. The content gate is ~800x of this batch's cycle
    // count (~20M with the gate, ~24K without), so the minimal batch is what
    // makes a real proof fit a memory-constrained machine. The canonical full
    // batch — content gate exercised inside the zkVM — stays the default.
    let minimal_batch = std::env::var("SP1_MINIMAL_BATCH").is_ok();

    // ── Seller-attestation schema + content (computed up front) ──
    // The seller attestation below carries a Layer B content_proof under a
    // schema the figaro-schema crate has a canonical encoder for.
    // figaro-ghg-protocol-v1 is the simplest such schema (one optional
    // uint8 field) and is cross-checking, so its agreement Merkle leaf is
    // keccak256(schemaId ++ content_ref).
    let schema_id_str = "figaro-ghg-protocol-v1";
    let schema_id = keccak256(schema_id_str.as_bytes());
    let content_json = serde_json::json!({ "scope": 1 });
    let canonical_bytes = figaro_schema::encode_content_for_schema(schema_id_str, &content_json)
        .expect("script-time encoding must succeed");
    let full_content_ref = keccak256(canonical_bytes.as_slice());
    // Single-section agreement: agreement_hash IS the lone section leaf, so
    // the kernel's Gate 5 (agreement inclusion) verifies with an empty proof.
    let mut leaf_preimage = [0u8; 64];
    leaf_preimage[..32].copy_from_slice(schema_id.as_slice());
    leaf_preimage[32..].copy_from_slice(full_content_ref.as_slice());
    let agreement_leaf = keccak256(leaf_preimage);

    let root = Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: SELLER1,
        currency: TOKEN,
        payment: U256::from(100_000_000_000_000_000_000u128),
        expected_cumulative_value: U256::from(100_000_000_000_000_000_000u128),
        agreement_hash: agreement_leaf,
        salt: U256::from(42u64),
        deadline: U256::from(2000u64),
    };

    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    // Process ID = root digest (computed by kernel).
    let root_struct_hash = commitment_struct_hash(&root);
    let process_id = typed_data_hash(&domain, &root_struct_hash);

    let resolve_hash = resolve_struct_hash(&process_id);
    let resolve_digest = typed_data_hash(&domain, &resolve_hash);
    let resolve_sig = sign_digest(&buyer_key, &resolve_digest);

    // ── Schema registration ──
    // Registered under the same schemaId the seller attestation attests to.
    let uri_hash = keccak256("ipfs://QmSchema");
    let schema_struct = register_schema_struct_hash(&schema_id, 1, &uri_hash);
    let schema_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &schema_struct));

    // ── Operator registration ──
    let op_struct = register_operator_struct_hash("ipfs://QmOp");
    let op_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &op_struct));

    // ── Seller attestation (with Layer B content_proof) ──
    //
    // This is the end-to-end content gate the kernel runs inside the SP1
    // proof: look up the embedded canonical spec for schema_id → validate
    // content → encode → keccak match → agreement inclusion. The script
    // builds a valid proof for figaro-ghg-protocol-v1 with scope=1 so every
    // gate passes through the zkVM emulator.
    //
    // Minimal-batch mode drops the content_proof to shrink the batch; an
    // attestation with no proof must also carry no content (content_ref
    // zeroed), or the kernel's content gate rejects it.
    let content_ref = if minimal_batch {
        B256::ZERO
    } else {
        full_content_ref
    };

    let root_struct_for_oh = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&process_id, &root_struct_for_oh);
    let attest_struct = attest_seller_struct_hash(&order_hash, &schema_id, 1, &content_ref);
    let attest_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &attest_struct));

    // ── Buyer attestation ──
    let buyer_attest_struct = attest_buyer_struct_hash(
        &process_id, &order_hash, &schema_id, 0, &B256::ZERO,
    );
    let buyer_attest_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &buyer_attest_struct));

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            // 1. Commit root order
            KernelOp::Commit {
                commitment: root.clone(),
                buyer_sig: root_buyer_sig,
                seller_sig: root_seller_sig,
            },
            // 2. Register schema
            KernelOp::RegisterSchema {
                schema_id,
                version: 1,
                uri_hash,
                registrar_sig: schema_sig,
            },
            // 3. Register operator
            KernelOp::RegisterOperator {
                metadata_uri: "ipfs://QmOp".to_string(),
                operator_sig: op_sig,
            },
            // 4. Seller attestation — in the default (full) batch it carries
            //    a Layer B content_proof so the SP1 run exercises the whole
            //    content gate inside the zkVM (embedded-spec lookup →
            //    validate → encode → keccak). Under SP1_MINIMAL_BATCH the
            //    content_proof is dropped and content_ref is zeroed — a
            //    content-opaque attestation the gate skips.
            KernelOp::AttestAsSeller {
                role_commitment: root.clone(),
                order_hash,
                schema_id,
                stage: 1,
                content_ref,
                seller_sig: attest_sig,
                content_proof: if minimal_batch {
                    None
                } else {
                    Some(AttestationContentProof {
                        content_json: serde_json::to_string(&content_json).unwrap(),
                        // Single-section agreement: agreement_hash IS the
                        // section leaf, so Gate 5 verifies with an empty proof.
                        inclusion_proof: vec![],
                        section_data: None,
                    })
                },
            },
            // 5. Buyer attestation
            KernelOp::AttestAsBuyer {
                process_id,
                order_hash,
                schema_id,
                stage: 0,
                content_ref: B256::ZERO,
                buyer_sig: buyer_attest_sig,
                content_proof: None,
            },
            // 6. Resolve process
            KernelOp::Resolve {
                process_id,
                commitments: vec![root],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: KernelStateSnapshot {
            processes: vec![],
            order_status: vec![],
            order_process_id: vec![],
            schemas_registered: vec![],
            operators_registered: vec![],
        },
    };

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
        if minimal_batch { "minimal — Layer B content gate OFF" }
        else { "full — Layer B content gate ON" },
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
    // Gate with SP1_REAL_PROOF=1 because real proving is slow on this
    // batch size (~20M cycles ≈ several minutes on a modern laptop,
    // significant memory). Mock execution above already validates the
    // program's correctness; the real proof is a cryptographic
    // attestation of that execution.
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
        println!("Proof size: {} bytes ({:.2} MB)", proof_bytes.len(), proof_bytes.len() as f64 / 1_048_576.0);

        println!("\n=== Real proof verified. ===");
    } else {
        println!("\n=== Execution verified. Program is correct. ===");
        println!("To generate a real local proof: SP1_REAL_PROOF=1 cargo run -p figaro-prove-test --release");
        println!("On a memory-constrained machine, add SP1_MINIMAL_BATCH=1 to drop the content gate.");
    }
}
