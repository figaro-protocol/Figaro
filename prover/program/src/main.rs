#![no_main]
sp1_zkvm::entrypoint!(main);

use figaro_kernel::kernel::apply_batch;
use figaro_kernel::types::BatchInput;

fn main() {
    let input: BatchInput = sp1_zkvm::io::read();
    let (public_values, _positions, _events) = apply_batch(&input).expect("invalid batch");
    sp1_zkvm::io::commit(&public_values);
}
