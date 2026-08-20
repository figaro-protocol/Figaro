#![no_main]
sp1_zkvm::entrypoint!(main);

use figaro_kernel::kernel::apply_batch;
use figaro_kernel::types::BatchInput;

fn main() {
    let input: BatchInput = sp1_zkvm::io::read();
    let (public_values, _positions, _events) = apply_batch(&input).expect("invalid batch");
    // Commit the ABI words the on-chain verifier hashes — never a serde
    // serialization, which no contract can reproduce.
    sp1_zkvm::io::commit_slice(&public_values.abi_encode());
}
