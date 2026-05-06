use alloy_primitives::{address, Address, B256, U256, keccak256};
use k256::ecdsa::SigningKey;
use sp1_sdk::{self, Prover, ProverClient, SP1Stdin};

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

    let root = Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: SELLER1,
        currency: TOKEN,
        payment: U256::from(100_000_000_000_000_000_000u128),
        expected_cumulative_value: U256::from(100_000_000_000_000_000_000u128),
        agreement_hash: keccak256("test-agreement"),
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
    let schema_id = keccak256("figaro-delivery-lifecycle-v1");
    let uri_hash = keccak256("ipfs://QmSchema");
    let schema_struct = register_schema_struct_hash(&schema_id, 1, &uri_hash);
    let schema_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &schema_struct));

    // ── Operator registration ──
    let op_struct = register_operator_struct_hash("ipfs://QmOp");
    let op_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &op_struct));

    // ── Seller attestation ──
    let root_struct_for_oh = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&process_id, &root_struct_for_oh);
    let content_ref = keccak256("evidence-payload");
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
            // 4. Seller attestation
            KernelOp::AttestAsSeller {
                role_commitment: root.clone(),
                order_hash,
                schema_id,
                stage: 1,
                content_ref,
                seller_sig: attest_sig,
            },
            // 5. Buyer attestation
            KernelOp::AttestAsBuyer {
                process_id,
                order_hash,
                schema_id,
                stage: 0,
                content_ref: B256::ZERO,
                buyer_sig: buyer_attest_sig,
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
            emission_settlement_count: 0,
            emission_total_emitted: U256::ZERO,
        },
        fig_token: Address::ZERO,
    };

    // Load the ELF.
    let elf = sp1_sdk::include_elf!("figaro-prover");

    // Create the prover client (mock for execution — no proof infrastructure overhead).
    let client = ProverClient::builder().mock().build().await;

    // Serialize input into SP1 stdin.
    let mut stdin = SP1Stdin::new();
    stdin.write(&input);

    // Execute first (no proof, just verify the program runs).
    println!("Executing program (no proof)...");
    let (mut public_values, report) = client
        .execute(elf, stdin)
        .await
        .unwrap();
    println!("Execution complete. Cycles: {}", report.total_instruction_count());

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

    println!("\n=== Execution verified. Program is correct. ===");
    println!("To generate a real proof, run with SP1_PROVER=network or SP1_PROVER=local");
}
