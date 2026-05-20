// rpgf-prove — host-side wrapper around the figaro-rpgf-prover SP1
// program. Reads a JSON payload from stdin shaped as:
//
//   {
//     "events": <EventStream>,
//     "tranche_index": u8,
//     "tranche_budget_wei": U256-hex-string,
//     "alpha_numerator": u32,
//     "alpha_denominator": u32,
//     "cap_numerator": u32,
//     "cap_denominator": u32
//   }
//
// Builds the TrancheInput via figaro_rpgf::build_tranche_input, runs
// the SP1 prover, and emits a JSON payload on stdout shaped as:
//
//   {
//     "public_values": "0x…",
//     "proof": "0x…",
//     "vkey": "0x…"
//   }
//
// Designed to be called as a subprocess by the TypeScript sequencer
// orchestrator. Reads stdin, writes stdout; log noise goes to stderr.

use std::io::Read;

use alloy_primitives::U256;
use figaro_rpgf::{build_tranche_input, events::EventStream};
use serde::{Deserialize, Serialize};
// ProveRequest / ProvingKey are imported anonymously (`as _`): their methods
// (`.groth16()`, `.run()`, `.verifying_key()`) must be in scope, but binding
// the `ProveRequest` name would collide with the local request struct below.
use sp1_sdk::blocking::{ProveRequest as _, Prover, ProverClient};
use sp1_sdk::{include_elf, Elf, HashableKey, ProvingKey as _, SP1Stdin};

const RPGF_ELF: Elf = include_elf!("figaro-rpgf-prover");

#[derive(Deserialize)]
struct ProveRequest {
    events: EventStream,
    tranche_index: u8,
    tranche_budget_wei: U256,
    alpha_numerator: u32,
    alpha_denominator: u32,
    cap_numerator: u32,
    cap_denominator: u32,
}

#[derive(Serialize)]
struct ProveResponse {
    public_values: String,
    proof: String,
    vkey: String,
}

fn main() {
    // SP1_VKEY_ONLY — derive and print the RPGF program verification key
    // (the vkey RpgfMinter is constructed with), then stop. setup() is the
    // cheap part of proving; this path never runs the prover.
    if std::env::var("SP1_VKEY_ONLY").is_ok() {
        eprintln!("rpgf-prove: SP1_VKEY_ONLY — deriving program verification key");
        let client = ProverClient::from_env();
        let pk = client.setup(RPGF_ELF).expect("setup failed");
        println!("RPGF_PROGRAM_VKEY={}", pk.verifying_key().bytes32());
        return;
    }

    eprintln!("rpgf-prove: reading request from stdin");
    let mut buf = String::new();
    std::io::stdin().read_to_string(&mut buf).expect("read stdin");
    let req: ProveRequest = serde_json::from_str(&buf).expect("parse ProveRequest JSON");

    eprintln!(
        "rpgf-prove: building TrancheInput (tranche {}, {} events → snapshots)",
        req.tranche_index,
        req.events.attestations.len()
    );
    let input = build_tranche_input(
        &req.events,
        req.tranche_index,
        req.tranche_budget_wei,
        req.alpha_numerator,
        req.alpha_denominator,
        req.cap_numerator,
        req.cap_denominator,
    );
    eprintln!("rpgf-prove: TrancheInput has {} snapshots", input.snapshots.len());

    eprintln!("rpgf-prove: setting up SP1 prover");
    let client = ProverClient::from_env();
    let mut stdin = SP1Stdin::new();
    stdin.write(&input);

    eprintln!("rpgf-prove: compiling key (this can take a while on first run)");
    let pk = client.setup(RPGF_ELF).expect("setup failed");

    eprintln!("rpgf-prove: generating proof");
    // Groth16: the `proof` and `vkey` emitted below are submitted on-chain to
    // RpgfMinter, and only Groth16/Plonk proofs carry on-chain-verifiable
    // `.bytes()` — a default Core proof would panic in `.bytes()` at runtime.
    let proof = client.prove(&pk, stdin).groth16().run().expect("prove failed");

    let response = ProveResponse {
        public_values: format!("0x{}", hex(proof.public_values.as_slice())),
        proof: format!("0x{}", hex(&proof.bytes())),
        vkey: pk.verifying_key().bytes32(),
    };
    let out = serde_json::to_string(&response).expect("serialize response");
    println!("{}", out);
    eprintln!("rpgf-prove: done");
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}
